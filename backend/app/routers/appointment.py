"""Appointment domain router (ticket #20).

Booking CRUD, server-enforced conflict detection and availability rules, the
doctor daily-schedule endpoint, and the lifecycle transitions
booked -> checked_in -> in_progress -> completed / cancelled / no_show.

RBAC: any role with the `appointments` permission can read and write. Doctors
are scoped to their own appointments/schedule; nurses to their department.
Availability/blocked-day writes are admin-only or doctor-self.
"""

from __future__ import annotations

import time
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.audit import write_audit
from app.db import get_db
from app.dependencies import require_permission, require_role
from app.services.availability import (
    get_doctor_slots,
    within_working_hours,
)
from app.services.conflict import find_doctor_conflict

router = APIRouter(tags=["appointment"])

STATUSES = ("booked", "checked_in", "in_progress", "completed", "cancelled", "no_show")
TERMINAL = ("completed", "cancelled", "no_show")

# ---- Requests --------------------------------------------------------------


class AppointmentCreate(BaseModel):
    patient_id: int
    doctor_id: int
    department_id: int | None = None
    scheduled_start: datetime
    scheduled_end: datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=5, le=480)
    reason: str | None = None
    notes: str | None = None


class AppointmentPatch(BaseModel):
    patient_id: int | None = None
    doctor_id: int | None = None
    department_id: int | None = None
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=5, le=480)
    reason: str | None = None
    notes: str | None = None


class LifecycleActionBody(BaseModel):
    reason: str | None = None


class CompleteAppointmentBody(BaseModel):
    clinical_notes: str | None = None
    visit_note_id: int | None = None


class AvailabilityWindow(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: str
    end_time: str
    department_id: int | None = None


class AvailabilityPut(BaseModel):
    windows: list[AvailabilityWindow]


class BlockedDayCreate(BaseModel):
    blocked_date: date
    reason: str = Field(min_length=1)
    start_time: str | None = None
    end_time: str | None = None


# ---- Helpers ---------------------------------------------------------------


def _to_epoch(dt: datetime) -> int:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return int(dt.timestamp())


def _iso(epoch: int | None) -> str | None:
    if epoch is None:
        return None
    return datetime.fromtimestamp(epoch, UTC).isoformat().replace("+00:00", "Z")


def _row_to_dict(row) -> dict:
    start = int(row["scheduled_at"])
    end = row["scheduled_end"]
    duration = int(row["duration_minutes"] or 30)
    end = int(end) if end is not None else start + duration * 60
    return {
        "id": row["id"],
        "patient_id": row["patient_id"],
        "doctor_id": row["doctor_id"],
        "department_id": row["department_id"],
        "scheduled_start": _iso(start),
        "scheduled_end": _iso(end),
        "scheduled_at": start,
        "duration_minutes": duration,
        "status": row["status"],
        "reason": row["reason"],
        "notes": row["notes"],
        "checked_in_at": _iso(row["checked_in_at"]),
        "completed_at": _iso(row["completed_at"]),
        "created_by": row["created_by"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _get_appointment(conn, appointment_id: int) -> dict:
    row = conn.execute(
        "SELECT * FROM appointments WHERE id = ?", (appointment_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return row


def _require_appointment_scope(user: dict, row: dict) -> None:
    """Doctor sees own appointments; nurse sees their department's."""
    if user["role"] == "doctor" and row["doctor_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if user["role"] == "nurse":
        dept = user["department_id"]
        if dept is None or row["department_id"] != dept:
            raise HTTPException(status_code=403, detail="Forbidden")


def _require_admin_or_self(user: dict, doctor_id: int) -> None:
    if user["role"] == "admin":
        return
    if user["role"] == "doctor" and user["id"] == doctor_id:
        return
    raise HTTPException(status_code=403, detail="Forbidden")


def _clock_minutes(value: str) -> int:
    """Parse an HH:MM clock string into minutes since midnight, or 422."""
    try:
        hour, minute = (int(p) for p in value.split(":"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail=f"Invalid time '{value}'; expected HH:MM") from None
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        raise HTTPException(status_code=422, detail=f"Invalid time '{value}'; expected HH:MM")
    return hour * 60 + minute


def _validate_windows(
    conn, doctor_id: int, windows: list[AvailabilityWindow]
) -> list[dict]:
    """Validate a PUT windows payload and return normalized dicts (raises 422).

    Rules: every window ends after it starts; department_id must exist; no two
    windows on the same weekday may overlap.
    """
    out: list[dict] = []
    for index, window in enumerate(windows, start=1):
        start = _clock_minutes(window.start_time)
        end = _clock_minutes(window.end_time)
        if end <= start:
            raise HTTPException(
                status_code=422,
                detail=f"Window {index}: end_time must be after start_time",
            )
        if window.department_id is not None and not conn.execute(
            "SELECT 1 FROM departments WHERE id = ?", (window.department_id,)
        ).fetchone():
            raise HTTPException(
                status_code=422,
                detail=f"Window {index}: unknown department_id {window.department_id}",
            )
        out.append(
            {
                "day_of_week": window.day_of_week,
                "start_time": window.start_time,
                "end_time": window.end_time,
                "start_min": start,
                "end_min": end,
                "department_id": window.department_id,
            }
        )
    for i in range(len(out)):
        for j in range(i + 1, len(out)):
            a, b = out[i], out[j]
            if a["day_of_week"] == b["day_of_week"] and a["start_min"] < b["end_min"] and b["start_min"] < a["end_min"]:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"Overlapping windows on weekday {a['day_of_week']} "
                        f"(window {i + 1} and window {j + 1})"
                    ),
                )
    return out


def _blocked_conflicts(
    conn, doctor_id: int, day: date, start_min: int | None, end_min: int | None
) -> list[dict]:
    """Appointments on `day` overlapping the block range, excluding terminal ones.

    A full-day block (start_min is None) conflicts with every non-terminal
    appointment that day. Partial blocks only conflict with appointments that
    intersect [start_min, end_min).
    """
    day_start = int(datetime(day.year, day.month, day.day, tzinfo=UTC).timestamp())
    day_end = day_start + 86400
    rows = conn.execute(
        "SELECT a.id, a.patient_id, a.scheduled_at, a.scheduled_end, a.duration_minutes, "
        "       p.full_name "
        "FROM appointments a LEFT JOIN patients p ON p.id = a.patient_id "
        "WHERE a.doctor_id = ? AND a.status NOT IN ('cancelled', 'no_show') "
        "  AND a.scheduled_at >= ? AND a.scheduled_at < ? "
        "ORDER BY a.scheduled_at",
        (doctor_id, day_start, day_end),
    ).fetchall()
    conflicts: list[dict] = []
    for row in rows:
        a_start = int(row["scheduled_at"])
        raw_end = row["scheduled_end"]
        a_end = (
            int(raw_end)
            if raw_end is not None
            else a_start + int(row["duration_minutes"] or 30) * 60
        )
        if start_min is None:
            overlaps = True
        else:
            block_start = day_start + start_min * 60
            block_end = day_start + end_min * 60
            overlaps = a_start < block_end and block_start < a_end
        if overlaps:
            conflicts.append(
                {
                    "id": row["id"],
                    "patient_id": row["patient_id"],
                    "patient_name": row["full_name"],
                    "scheduled_start": _iso(a_start),
                    "scheduled_end": _iso(a_end),
                }
            )
    return conflicts


def _resolve_existence(conn, body: dict) -> None:
    """Raise 404 for nonexistent patient/doctor/department references."""
    if not conn.execute(
        "SELECT 1 FROM patients WHERE id = ?", (body["patient_id"],)
    ).fetchone():
        raise HTTPException(status_code=404, detail="Patient not found")
    doctor = conn.execute(
        "SELECT id, role FROM users WHERE id = ?", (body["doctor_id"],)
    ).fetchone()
    if doctor is None:
        raise HTTPException(status_code=404, detail="Doctor not found")
    if doctor["role"] != "doctor":
        raise HTTPException(
            status_code=422, detail="doctor_id must reference a doctor account"
        )
    dept_id = body.get("department_id")
    if dept_id is not None and not conn.execute(
        "SELECT 1 FROM departments WHERE id = ?", (dept_id,)
    ).fetchone():
        raise HTTPException(status_code=404, detail="Department not found")


def _enforce_booking_rules(conn, doctor_id: int, start: int, end: int, exclude_id=None) -> None:
    if end <= start:
        raise HTTPException(status_code=422, detail="scheduled_end must be after scheduled_start")
    if not within_working_hours(conn, doctor_id, start, end):
        day = datetime.fromtimestamp(start, UTC).date()
        raise HTTPException(
            status_code=409,
            detail=f"Doctor unavailable on {day.isoformat()} (outside working hours, "
            "off-day or blocked)",
        )
    conflict = find_doctor_conflict(conn, doctor_id, start, end, exclude_id=exclude_id)
    if conflict is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Doctor already booked (appointment {conflict.appointment_id}, "
                f"{_iso(conflict.start)} to {_iso(conflict.end)})"
            ),
        )


def _insert_lifecycle_event(
    conn, appointment_id: int, from_status, to_status, by_user_id, reason=None
) -> None:
    conn.execute(
        "INSERT INTO appointment_lifecycle_events "
        "(appointment_id, from_status, to_status, occurred_at, by_user_id, reason) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (appointment_id, from_status, to_status, int(time.time()), by_user_id, reason),
    )


def _wait_metrics(conn, row) -> tuple[int | None, bool | None]:
    """Wait time (minutes) and late flag for an appointment row (ticket #43).

    Wait time counts from check-in until the appointment moves in-progress;
    a still-waiting patient keeps counting against "now". `is_late` is True
    when the patient arrived after the scheduled start. Both are None for an
    appointment that was never checked in.
    """
    if row["checked_in_at"] is None:
        return None, None
    start = int(row["checked_in_at"])
    scheduled = int(row["scheduled_at"])
    end_marker = int(time.time())
    if row["completed_at"] is not None:
        end_marker = int(row["completed_at"])
    if row["status"] in ("in_progress", "completed"):
        ev = conn.execute(
            "SELECT occurred_at FROM appointment_lifecycle_events "
            "WHERE appointment_id = ? AND to_status = 'in_progress' "
            "ORDER BY occurred_at LIMIT 1",
            (row["id"],),
        ).fetchone()
        if ev is not None:
            end_marker = int(ev["occurred_at"])
    wait = max(0, end_marker - start) // 60
    return wait, start > scheduled


def _transition(
    conn, appointment_id: int, user: dict, action: str, from_status, to_status, reason=None
) -> dict:
    """Apply one lifecycle transition with event + audit, returning the row."""
    row = _get_appointment(conn, appointment_id)
    if row["status"] != from_status:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot {action.replace('_', ' ')} an appointment in status '{row['status']}' "
            f"(expected '{from_status}')",
        )
    now = int(time.time())
    updates: list[str] = ["status = ?", "updated_at = ?"]
    params: list = [to_status, now]
    if action == "check_in":
        updates.append("checked_in_at = ?")
        params.append(now)
    elif action == "complete":
        updates.append("completed_at = ?")
        params.append(now)
    params.append(appointment_id)
    conn.execute(
        f"UPDATE appointments SET {', '.join(updates)} WHERE id = ?", params
    )
    _insert_lifecycle_event(conn, appointment_id, row["status"], to_status, user["id"], reason)
    write_audit(
        user["id"], f"appointment.{action}", "appointment", appointment_id,
        {"from": row["status"], "to": to_status, "reason": reason},
        conn=conn,
    )
    fresh = conn.execute("SELECT * FROM appointments WHERE id = ?", (appointment_id,)).fetchone()
    return fresh


# ---- Appointment CRUD ------------------------------------------------------


@router.get("/appointments", status_code=status.HTTP_200_OK)
async def list_appointments(
    date: str | None = Query(default=None),
    doctor_id: int | None = None,
    department_id: int | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    user: dict = Depends(require_permission("appointments")),
) -> dict:
    clauses: list[str] = []
    params: list = []
    if date:
        day = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=UTC).date()
        day_start = int(datetime(day.year, day.month, day.day, tzinfo=UTC).timestamp())
        clauses.append("scheduled_at >= ?")
        params.append(day_start)
        clauses.append("scheduled_at < ?")
        params.append(day_start + 86400)
    if doctor_id is not None:
        clauses.append("doctor_id = ?")
        params.append(doctor_id)
    if department_id is not None:
        clauses.append("department_id = ?")
        params.append(department_id)
    if status_filter:
        if status_filter not in STATUSES:
            raise HTTPException(status_code=422, detail="Unknown appointment status")
        clauses.append("status = ?")
        params.append(status_filter)
    if user["role"] == "doctor":
        clauses.append("doctor_id = ?")
        params.append(user["id"])
    if user["role"] == "nurse" and user["department_id"] is not None:
        clauses.append("department_id = ?")
        params.append(user["department_id"])
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    with get_db() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) AS n FROM appointments {where}", params
        ).fetchone()["n"]
        rows = conn.execute(
            f"SELECT * FROM appointments {where} ORDER BY scheduled_at LIMIT ? OFFSET ?",
            params + [page_size, (page - 1) * page_size],
        ).fetchall()
    return {
        "appointments": [_row_to_dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/appointments/wait-time-stats", status_code=status.HTTP_200_OK)
async def appointment_wait_time_stats(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    _user=Depends(require_role("admin")),
) -> dict:
    """Per-doctor-per-day wait-time aggregates for admin reporting (#43)."""
    where = ["checked_in_at IS NOT NULL"]
    params: list = []
    if from_:
        where.append("scheduled_at >= ?")
        params.append(_to_epoch(datetime.fromisoformat(from_.replace("Z", "+00:00"))))
    if to:
        where.append("scheduled_at <= ?")
        params.append(_to_epoch(datetime.fromisoformat(to.replace("Z", "+00:00"))))
    if from_ and to and _to_epoch(datetime.fromisoformat(from_.replace("Z", "+00:00"))) > _to_epoch(
        datetime.fromisoformat(to.replace("Z", "+00:00"))
    ):
        raise HTTPException(status_code=422, detail="from must be on or before to")
    groups: dict[tuple[int, str], list[int]] = {}
    with get_db() as conn:
        rows = conn.execute(
            f"SELECT * FROM appointments WHERE {' AND '.join(where)}", params
        ).fetchall()
        for row in rows:
            wait, _ = _wait_metrics(conn, row)
            if wait is None:
                continue
            day = datetime.fromtimestamp(int(row["scheduled_at"]), UTC).date().isoformat()
            groups.setdefault((row["doctor_id"], day), []).append(wait)
    stats = []
    for (doctor_id, day), waits in sorted(groups.items()):
        stats.append(
            {
                "doctor_id": doctor_id,
                "day": day,
                "appointments": len(waits),
                "avg_wait_minutes": round(sum(waits) / len(waits), 1),
                "min_wait_minutes": min(waits),
                "max_wait_minutes": max(waits),
            }
        )
    return {"stats": stats}


@router.get("/appointments/{appointment_id}", status_code=status.HTTP_200_OK)
async def get_appointment(
    appointment_id: int, user: dict = Depends(require_permission("appointments"))
) -> dict:
    with get_db() as conn:
        row = _get_appointment(conn, appointment_id)
        _require_appointment_scope(user, row)
        events = conn.execute(
            "SELECT id, from_status, to_status, occurred_at, by_user_id, reason "
            "FROM appointment_lifecycle_events WHERE appointment_id = ? "
            "ORDER BY occurred_at",
            (appointment_id,),
        ).fetchall()
        wait, is_late = _wait_metrics(conn, row)
    payload = _row_to_dict(row)
    payload["lifecycle_events"] = [
        {
            "id": e["id"],
            "from_status": e["from_status"],
            "to_status": e["to_status"],
            "occurred_at": _iso(e["occurred_at"]),
            "by_user_id": e["by_user_id"],
            "reason": e["reason"],
        }
        for e in events
    ]
    payload["wait_time_minutes"] = wait
    payload["is_late"] = is_late
    return payload


@router.post("/appointments", status_code=status.HTTP_201_CREATED)
async def create_appointment(
    body: AppointmentCreate, user: dict = Depends(require_permission("appointments"))
) -> dict:
    start = _to_epoch(body.scheduled_start)
    duration = body.duration_minutes or 30
    end = (
        _to_epoch(body.scheduled_end)
        if body.scheduled_end is not None
        else start + duration * 60
    )
    if end <= start:
        raise HTTPException(
            status_code=422, detail="scheduled_end must be after scheduled_start"
        )

    with get_db() as conn:
        _resolve_existence(conn, {
            "patient_id": body.patient_id,
            "doctor_id": body.doctor_id,
            "department_id": body.department_id,
        })
        _enforce_booking_rules(conn, body.doctor_id, start, end)
        now = int(time.time())
        cursor = conn.execute(
            "INSERT INTO appointments (patient_id, doctor_id, department_id, scheduled_at, "
            "scheduled_end, duration_minutes, reason, notes, status, created_by, created_at, "
            "updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'booked', ?, ?, ?)",
            (
                body.patient_id,
                body.doctor_id,
                body.department_id,
                start,
                end,
                duration,
                body.reason,
                body.notes,
                user["id"],
                now,
                now,
            ),
        )
        new_id = cursor.lastrowid
        _insert_lifecycle_event(conn, new_id, None, "booked", user["id"], None)
        write_audit(
            user["id"], "appointment.create", "appointment", new_id,
            {"patient_id": body.patient_id, "doctor_id": body.doctor_id,
             "start": _iso(start), "end": _iso(end)},
            conn=conn,
        )
        row = conn.execute("SELECT * FROM appointments WHERE id = ?", (new_id,)).fetchone()
    return _row_to_dict(row)


@router.patch("/appointments/{appointment_id}", status_code=status.HTTP_200_OK)
async def update_appointment(
    appointment_id: int,
    body: AppointmentPatch,
    user: dict = Depends(require_permission("appointments")),
) -> dict:
    with get_db() as conn:
        existing = _get_appointment(conn, appointment_id)
        _require_appointment_scope(user, existing)

        fields: dict = {}
        if "patient_id" in body.model_fields_set and body.patient_id is not None:
            fields["patient_id"] = body.patient_id
        if "department_id" in body.model_fields_set and body.department_id is not None:
            fields["department_id"] = body.department_id
        if "reason" in body.model_fields_set:
            fields["reason"] = body.reason
        if "notes" in body.model_fields_set:
            fields["notes"] = body.notes

        reschedule = any(
            k in body.model_fields_set
            for k in ("doctor_id", "scheduled_start", "scheduled_end", "duration_minutes")
        )
        if reschedule:
            new_doctor = body.doctor_id if body.doctor_id is not None else existing["doctor_id"]
            start = (
                _to_epoch(body.scheduled_start)
                if body.scheduled_start is not None
                else int(existing["scheduled_at"])
            )
            duration = body.duration_minutes or int(existing["duration_minutes"] or 30)
            end = (
                _to_epoch(body.scheduled_end)
                if body.scheduled_end is not None
                else start + duration * 60
            )
            if body.doctor_id is not None:
                if not conn.execute(
                    "SELECT 1 FROM users WHERE id = ? AND role = 'doctor'", (body.doctor_id,)
                ).fetchone():
                    raise HTTPException(status_code=404, detail="Doctor not found")
            _enforce_booking_rules(conn, new_doctor, start, end, exclude_id=appointment_id)
            fields["doctor_id"] = new_doctor
            fields["scheduled_at"] = start
            fields["scheduled_end"] = end
            fields["duration_minutes"] = duration

        if not fields:
            raise HTTPException(status_code=422, detail="Nothing to update")

        assignments = ", ".join(f"{col} = ?" for col in fields)
        conn.execute(
            f"UPDATE appointments SET {assignments}, updated_at = ? WHERE id = ?",
            list(fields.values()) + [int(time.time()), appointment_id],
        )
        write_audit(
            user["id"], "appointment.update", "appointment", appointment_id, fields,
            conn=conn,
        )
        row = conn.execute("SELECT * FROM appointments WHERE id = ?", (appointment_id,)).fetchone()
    return _row_to_dict(row)


# ---- Lifecycle transitions -------------------------------------------------


@router.post("/appointments/{appointment_id}/check-in", status_code=status.HTTP_200_OK)
async def check_in(
    appointment_id: int, user: dict = Depends(require_permission("appointments"))
) -> dict:
    with get_db() as conn:
        row = _get_appointment(conn, appointment_id)
        _require_appointment_scope(user, row)
        fresh = _transition(conn, appointment_id, user, "check_in", "booked", "checked_in")
    return _row_to_dict(fresh)


@router.post("/appointments/{appointment_id}/start", status_code=status.HTTP_200_OK)
async def start_appointment(
    appointment_id: int, user: dict = Depends(require_permission("appointments"))
) -> dict:
    with get_db() as conn:
        row = _get_appointment(conn, appointment_id)
        _require_appointment_scope(user, row)
        fresh = _transition(conn, appointment_id, user, "start", "checked_in", "in_progress")
    return _row_to_dict(fresh)


@router.post("/appointments/{appointment_id}/complete", status_code=status.HTTP_200_OK)
async def complete_appointment(
    appointment_id: int,
    body: CompleteAppointmentBody,
    user: dict = Depends(require_permission("appointments")),
) -> dict:
    if not (body.clinical_notes or "").strip() and body.visit_note_id is None:
        raise HTTPException(
            status_code=422,
            detail="clinical_notes summary or an attached visit_note_id is required to complete",
        )
    with get_db() as conn:
        row = _get_appointment(conn, appointment_id)
        _require_appointment_scope(user, row)
        if body.visit_note_id is not None and not conn.execute(
            "SELECT 1 FROM visit_notes WHERE id = ?", (body.visit_note_id,)
        ).fetchone():
            raise HTTPException(status_code=404, detail="Visit note not found")
        fresh = _transition(conn, appointment_id, user, "complete", "in_progress", "completed")
    return _row_to_dict(fresh)


@router.post("/appointments/{appointment_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_appointment(
    appointment_id: int,
    body: LifecycleActionBody,
    user: dict = Depends(require_permission("appointments")),
) -> dict:
    with get_db() as conn:
        row = _get_appointment(conn, appointment_id)
        _require_appointment_scope(user, row)
        if row["status"] in TERMINAL:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot cancel an appointment in '{row['status']}'",
            )
        fresh = _transition(
            conn, appointment_id, user, "cancel", row["status"], "cancelled", body.reason
        )
    return _row_to_dict(fresh)


@router.post("/appointments/{appointment_id}/no-show", status_code=status.HTTP_200_OK)
async def no_show_appointment(
    appointment_id: int,
    body: LifecycleActionBody,
    user: dict = Depends(require_permission("appointments")),
) -> dict:
    with get_db() as conn:
        row = _get_appointment(conn, appointment_id)
        _require_appointment_scope(user, row)
        if row["status"] not in ("booked", "checked_in"):
            raise HTTPException(status_code=409, detail=f"Cannot mark '{row['status']}' as no-show")
        fresh = _transition(
            conn, appointment_id, user, "no_show", row["status"], "no_show", body.reason
        )
    return _row_to_dict(fresh)


# ---- Doctor schedule + availability ----------------------------------------


@router.get("/doctors/{doctor_id}/schedule", status_code=status.HTTP_200_OK)
async def doctor_schedule(
    doctor_id: int,
    date: str = Query(..., description="YYYY-MM-DD"),
    user: dict = Depends(require_permission("appointments")),
) -> dict:
    if user["role"] == "doctor" and user["id"] != doctor_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    with get_db() as conn:
        if not conn.execute(
            "SELECT 1 FROM users WHERE id = ? AND role = 'doctor'", (doctor_id,)
        ).fetchone():
            raise HTTPException(status_code=404, detail="Doctor not found")
        slots = get_doctor_slots(conn, doctor_id, date)
    return {"doctor_id": doctor_id, "date": date, "slots": slots}


@router.get("/doctors/{doctor_id}/availability", status_code=status.HTTP_200_OK)
async def get_doctor_availability(
    doctor_id: int,
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
    user: dict = Depends(require_permission("appointments")),
) -> dict:
    if user["role"] == "doctor" and user["id"] != doctor_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    today = datetime.now(UTC).date()
    try:
        start_day = (
            datetime.strptime(from_date, "%Y-%m-%d").date() if from_date else today
        )
        end_day = (
            datetime.strptime(to_date, "%Y-%m-%d").date()
            if to_date
            else start_day + timedelta(days=6)
        )
    except ValueError:
        raise HTTPException(status_code=422, detail="from/to must be YYYY-MM-DD") from None
    if end_day < start_day:
        raise HTTPException(status_code=422, detail="to must be on or after from")

    with get_db() as conn:
        if not conn.execute(
            "SELECT 1 FROM users WHERE id = ? AND role = 'doctor'", (doctor_id,)
        ).fetchone():
            raise HTTPException(status_code=404, detail="Doctor not found")
        windows = conn.execute(
            "SELECT id, day_of_week, start_time, end_time, department_id "
            "FROM doctor_availability WHERE doctor_id = ? ORDER BY day_of_week, start_time",
            (doctor_id,),
        ).fetchall()
        blocked = conn.execute(
            "SELECT id, blocked_date, start_time, end_time, reason FROM doctor_blocked_days "
            "WHERE doctor_id = ? ORDER BY blocked_date",
            (doctor_id,),
        ).fetchall()
        blocked_by_date = {b["blocked_date"]: b for b in blocked}

        week: list[dict] = []
        cursor = start_day
        while cursor <= end_day:
            slots = get_doctor_slots(conn, doctor_id, cursor)
            week.append(
                {
                    "date": cursor.isoformat(),
                    "day_of_week": cursor.weekday(),
                    "blocked": blocked_by_date.get(cursor.isoformat()) is not None,
                    "capacity": len(slots),
                    "booked": sum(1 for s in slots if s["status"] == "booked"),
                    "slots": slots,
                }
            )
            cursor += timedelta(days=1)

    return {
        "doctor_id": doctor_id,
        "windows": [
            {
                "id": w["id"],
                "day_of_week": w["day_of_week"],
                "start_time": w["start_time"],
                "end_time": w["end_time"],
                "department_id": w["department_id"],
            }
            for w in windows
        ],
        "blocked_days": [
            {
                "id": b["id"],
                "blocked_date": b["blocked_date"],
                "start_time": b["start_time"],
                "end_time": b["end_time"],
                "reason": b["reason"],
            }
            for b in blocked
        ],
        "week": week,
    }


@router.put("/doctors/{doctor_id}/availability", status_code=status.HTTP_200_OK)
async def put_doctor_availability(
    doctor_id: int,
    body: AvailabilityPut,
    user: dict = Depends(require_permission("appointments")),
) -> dict:
    _require_admin_or_self(user, doctor_id)
    with get_db() as conn:
        if not conn.execute(
            "SELECT 1 FROM users WHERE id = ? AND role = 'doctor'", (doctor_id,)
        ).fetchone():
            raise HTTPException(status_code=404, detail="Doctor not found")
        validated = _validate_windows(conn, doctor_id, body.windows)
        conn.execute("DELETE FROM doctor_availability WHERE doctor_id = ?", (doctor_id,))
        saved: list[dict] = []
        for window in validated:
            cursor = conn.execute(
                "INSERT INTO doctor_availability "
                "(doctor_id, day_of_week, start_time, end_time, department_id) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    doctor_id,
                    window["day_of_week"],
                    window["start_time"],
                    window["end_time"],
                    window["department_id"],
                ),
            )
            saved.append(
                {
                    "id": cursor.lastrowid,
                    "day_of_week": window["day_of_week"],
                    "start_time": window["start_time"],
                    "end_time": window["end_time"],
                    "department_id": window["department_id"],
                }
            )
        write_audit(
            user["id"], "availability.update", "doctor", doctor_id,
            {"windows": saved},
            conn=conn,
        )
    return {"doctor_id": doctor_id, "windows": saved}


@router.post("/doctors/{doctor_id}/blocked-days", status_code=status.HTTP_201_CREATED)
async def add_blocked_day(
    doctor_id: int,
    body: BlockedDayCreate,
    user: dict = Depends(require_permission("appointments")),
) -> dict:
    _require_admin_or_self(user, doctor_id)
    if (body.start_time is None) != (body.end_time is None):
        raise HTTPException(
            status_code=422,
            detail="start_time and end_time must be provided together (or both omitted for a full day)",
        )
    start_min = end_min = None
    if body.start_time is not None:
        start_min = _clock_minutes(body.start_time)
        end_min = _clock_minutes(body.end_time)
        if end_min <= start_min:
            raise HTTPException(status_code=422, detail="end_time must be after start_time")

    with get_db() as conn:
        if not conn.execute(
            "SELECT 1 FROM users WHERE id = ? AND role = 'doctor'", (doctor_id,)
        ).fetchone():
            raise HTTPException(status_code=404, detail="Doctor not found")
        conflicts = _blocked_conflicts(conn, doctor_id, body.blocked_date, start_min, end_min)
        if conflicts:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "blocked_day_conflicts",
                    "message": f"Block conflicts with {len(conflicts)} appointment(s)",
                    "conflicts": conflicts,
                },
            )
        existing = conn.execute(
            "SELECT start_time, end_time FROM doctor_blocked_days "
            "WHERE doctor_id = ? AND blocked_date = ?",
            (doctor_id, body.blocked_date.isoformat()),
        ).fetchall()
        for row in existing:
            existing_start = (
                _clock_minutes(row["start_time"]) if row["start_time"] else None
            )
            existing_end = _clock_minutes(row["end_time"]) if row["end_time"] else None
            if start_min is None or existing_start is None:
                raise HTTPException(status_code=409, detail="That date is already blocked")
            if start_min < existing_end and existing_start < end_min:
                raise HTTPException(status_code=409, detail="That period is already blocked")

        cursor = conn.execute(
            "INSERT INTO doctor_blocked_days "
            "(doctor_id, blocked_date, start_time, end_time, reason) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                doctor_id,
                body.blocked_date.isoformat(),
                body.start_time,
                body.end_time,
                body.reason,
            ),
        )
        write_audit(
            user["id"], "availability.blocked_add", "doctor", doctor_id,
            {
                "date": body.blocked_date.isoformat(),
                "start_time": body.start_time,
                "end_time": body.end_time,
                "reason": body.reason,
            },
            conn=conn,
        )
    return {
        "id": cursor.lastrowid,
        "doctor_id": doctor_id,
        "blocked_date": body.blocked_date.isoformat(),
        "start_time": body.start_time,
        "end_time": body.end_time,
        "reason": body.reason,
    }


@router.delete(
    "/doctors/{doctor_id}/blocked-days/{blocked_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_blocked_day(
    doctor_id: int,
    blocked_id: int,
    user: dict = Depends(require_permission("appointments")),
) -> None:
    _require_admin_or_self(user, doctor_id)
    with get_db() as conn:
        if not conn.execute(
            "SELECT 1 FROM users WHERE id = ? AND role = 'doctor'", (doctor_id,)
        ).fetchone():
            raise HTTPException(status_code=404, detail="Doctor not found")
        row = conn.execute(
            "SELECT id, blocked_date FROM doctor_blocked_days WHERE id = ? AND doctor_id = ?",
            (blocked_id, doctor_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Blocked period not found")
        conn.execute("DELETE FROM doctor_blocked_days WHERE id = ?", (blocked_id,))
        write_audit(
            user["id"], "availability.blocked_delete", "doctor", doctor_id,
            {"id": blocked_id, "date": row["blocked_date"]},
            conn=conn,
        )
