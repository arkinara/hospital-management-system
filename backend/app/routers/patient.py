"""Patient domain router (ticket #19).

Endpoints (all require authentication; RBAC via the `patients` permission):

- GET    /patients                       search + filter + pagination
- GET    /patients/{id}                  full record (allergies + departments)
- POST   /patients                       register; dedup-check runs BEFORE insert
- PATCH  /patients/{id}                  partial update
- POST   /patients/{id}/allergies        add a safety-banner allergy
- DELETE /patients/{id}/allergies/{aid}  remove an allergy (admin only)
- GET    /patients/{id}/timeline         cross-department history
- POST   /patients/dedup-check           advisory duplicate lookup for the UI

Dedup is server-enforced: a duplicate national_id, or a fuzzy name+DOB match
above the threshold, returns 409 unless an Admin sends `X-Override-Dedup`.
"""

from __future__ import annotations

import re
from datetime import UTC, date, datetime, time
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.audit import write_audit
from app.db import get_db
from app.dependencies import require_permission
from app.services import dedup as dedup_service
from app.services import patient_search

router = APIRouter(prefix="/patients", tags=["patient"])

Acuity = Literal["critical", "urgent", "standard", "routine"]
AdmissionStatus = Literal["admitted", "outpatient", "discharged"]
Sex = Literal["m", "f", "o"]
Severity = Literal["mild", "moderate", "severe", "life_threatening"]

_NATIONAL_ID_RE = r"^\d{8,20}$"
_EMAIL_RE = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class PatientCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    dob: date
    phone: str = Field(min_length=1, max_length=40)
    national_id: str | None = Field(default=None, pattern=_NATIONAL_ID_RE)
    sex: Sex | None = None
    email: str | None = Field(default=None, pattern=_EMAIL_RE)
    address: str | None = None
    blood_type: str | None = None
    acuity: Acuity = "standard"
    admission_status: AdmissionStatus = "outpatient"
    primary_department_id: int | None = None
    payer_name: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None


class PatientUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    dob: date | None = None
    phone: str | None = Field(default=None, min_length=1, max_length=40)
    national_id: str | None = Field(default=None, pattern=_NATIONAL_ID_RE)
    sex: Sex | None = None
    email: str | None = Field(default=None, pattern=_EMAIL_RE)
    address: str | None = None
    blood_type: str | None = None
    acuity: Acuity | None = None
    admission_status: AdmissionStatus | None = None
    is_active: bool | None = None
    primary_department_id: int | None = None
    payer_name: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None


class AllergyCreate(BaseModel):
    allergen: str = Field(min_length=1, max_length=200)
    severity: Severity
    reaction: str | None = None


class DedupCheckRequest(BaseModel):
    national_id: str | None = Field(default=None, pattern=_NATIONAL_ID_RE)
    full_name: str | None = None
    dob: date | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _forbidden() -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def require_patient_read(user: dict[str, Any] = Depends(require_permission("patients"))) -> dict:
    return user


def require_patient_write(
    user: dict[str, Any] = Depends(require_permission("patients")),
) -> dict:
    """Registration/update is receptionist or admin."""
    if user["role"] not in ("admin", "receptionist"):
        raise _forbidden()
    return user


def require_patient_admin(
    user: dict[str, Any] = Depends(require_permission("patients")),
) -> dict:
    if user["role"] != "admin":
        raise _forbidden()
    return user


def _date_to_ts(value: date | None) -> int | None:
    if value is None:
        return None
    return int(datetime.combine(value, time.min, tzinfo=UTC).timestamp())


def _ts_to_iso(value: int | None) -> str | None:
    if value is None:
        return None
    return datetime.fromtimestamp(int(value), UTC).isoformat()


def _ts_to_date(value: int | None) -> str | None:
    if value is None:
        return None
    return datetime.fromtimestamp(int(value), UTC).date().isoformat()


def serialize_patient(row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "mrn": row["mrn"],
        "full_name": row["full_name"],
        "dob": _ts_to_date(row["dob"]),
        "sex": row["sex"],
        "national_id": row["national_id"],
        "phone": row["phone"],
        "email": row["email"],
        "address": row["address"],
        "blood_type": row["blood_type"],
        "emergency_contact_name": row["emergency_contact_name"],
        "emergency_contact_phone": row["emergency_contact_phone"],
        "acuity": row["acuity"],
        "admission_status": row["admission_status"],
        "is_active": bool(row["is_active"]),
        "primary_department_id": row["primary_department_id"],
        "payer_name": row["payer_name"],
        "created_by": row["created_by"],
        "created_at": _ts_to_iso(row["created_at"]),
        "updated_at": _ts_to_iso(row["updated_at"]),
    }


def serialize_allergy(row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "patient_id": row["patient_id"],
        "allergen": row["allergen"],
        "severity": row["severity"],
        "reaction": row["reaction"],
        "noted_by": row["noted_by"],
        "noted_at": _ts_to_iso(row["noted_at"]),
    }


def _suspect_dict(suspect: dedup_service.Suspect) -> dict[str, Any]:
    return {
        "patient_id": suspect.patient_id,
        "id": suspect.patient_id,
        "mrn": suspect.mrn,
        "full_name": suspect.full_name,
        "dob": _ts_to_date(suspect.dob),
        "national_id": suspect.national_id,
        "match_type": suspect.match_type,
        "similarity": suspect.similarity,
    }


def _next_mrn(conn) -> str:
    rows = conn.execute("SELECT mrn FROM patients").fetchall()
    highest = 0
    for row in rows:
        digits = re.sub(r"\D", "", row["mrn"] or "")
        if digits:
            highest = max(highest, int(digits))
    candidate = highest + 1
    while conn.execute("SELECT 1 FROM patients WHERE mrn = ?", (f"MRN-{candidate:06d}",)).fetchone():
        candidate += 1
    return f"MRN-{candidate:06d}"


def _get_patient(conn, patient_id: int):
    return conn.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()


def _allergies(conn, patient_id: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM patient_allergies WHERE patient_id = ? ORDER BY noted_at DESC",
        (patient_id,),
    ).fetchall()
    return [serialize_allergy(r) for r in rows]


def _departments(conn, patient_id: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT pd.department_id, d.code, d.name, pd.since_date "
        "FROM patient_departments pd JOIN departments d ON d.id = pd.department_id "
        "WHERE pd.patient_id = ? ORDER BY pd.since_date",
        (patient_id,),
    ).fetchall()
    return [
        {
            "department_id": r["department_id"],
            "code": r["code"],
            "name": r["name"],
            "since_date": _ts_to_iso(r["since_date"]),
        }
        for r in rows
    ]


def _duplicate_response(suspects: list[dedup_service.Suspect]) -> JSONResponse:
    exact = next((s for s in suspects if s.match_type == "national_id"), None)
    body: dict[str, Any] = {
        "error": {
            "code": "duplicate_patient",
            "message": "A possible duplicate patient already exists.",
            "trace_id": str(uuid4()),
        },
        "match_type": exact.match_type if exact else "fuzzy_name_dob",
        "suspects": [_suspect_dict(s) for s in suspects],
    }
    if exact is not None:
        body["existing"] = _suspect_dict(exact)
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content=body)


def _audit_dedup_hits(actor_id: int | None, suspects: list[dedup_service.Suspect]) -> None:
    for suspect in suspects:
        write_audit(
            actor_id,
            "patient.dedup_hit",
            "patient",
            suspect.patient_id,
            {"match_type": suspect.match_type, "similarity": suspect.similarity},
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("")
def list_patients(
    query: str | None = Query(default=None),
    department: str | None = Query(default=None),
    acuity: Acuity | None = Query(default=None),
    admission_status: AdmissionStatus | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1),
    user: dict[str, Any] = Depends(require_patient_read),
) -> dict[str, Any]:
    size = patient_search.clamp_page_size(page_size)
    with get_db() as conn:
        rows, total = patient_search.search_patients(
            conn,
            query=query,
            department=department,
            acuity=acuity,
            admission_status=admission_status,
            page=page,
            page_size=size,
        )
    return {
        "patients": [serialize_patient(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": size,
    }


@router.post("/dedup-check")
def dedup_check(
    payload: DedupCheckRequest,
    user: dict[str, Any] = Depends(require_patient_read),
) -> dict[str, Any]:
    with get_db() as conn:
        suspects = dedup_service.check_duplicates(
            conn,
            payload.national_id,
            payload.full_name,
            _date_to_ts(payload.dob),
        )
    return {"suspects": [_suspect_dict(s) for s in suspects]}


@router.get("/{patient_id}")
def get_patient(
    patient_id: int,
    user: dict[str, Any] = Depends(require_patient_read),
) -> dict[str, Any]:
    with get_db() as conn:
        row = _get_patient(conn, patient_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Patient not found")
        record = serialize_patient(row)
        record["allergies"] = _allergies(conn, patient_id)
        record["departments"] = _departments(conn, patient_id)
    return record


@router.post("", status_code=status.HTTP_201_CREATED)
def create_patient(
    payload: PatientCreate,
    x_override_dedup: str | None = Header(default=None),
    user: dict[str, Any] = Depends(require_patient_write),
) -> Any:
    dob_ts = _date_to_ts(payload.dob)
    with get_db() as conn:
        suspects = dedup_service.check_duplicates(
            conn, payload.national_id, payload.full_name, dob_ts
        )
        override = x_override_dedup is not None and x_override_dedup.strip() != ""
        if suspects and not override:
            _audit_dedup_hits(user["id"], suspects)
            return _duplicate_response(suspects)
        if suspects and override and user["role"] != "admin":
            raise _forbidden()

        mrn = _next_mrn(conn)
        now = int(datetime.now(UTC).timestamp())
        cursor = conn.execute(
            "INSERT INTO patients "
            "(mrn, full_name, dob, sex, national_id, phone, email, address, blood_type, "
            "emergency_contact_name, emergency_contact_phone, acuity, admission_status, "
            "is_active, primary_department_id, payer_name, created_by, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)",
            (
                mrn,
                payload.full_name,
                dob_ts,
                payload.sex,
                payload.national_id,
                payload.phone,
                payload.email,
                payload.address,
                payload.blood_type,
                payload.emergency_contact_name,
                payload.emergency_contact_phone,
                payload.acuity,
                payload.admission_status,
                payload.primary_department_id,
                payload.payer_name,
                user["id"],
                now,
            ),
        )
        patient_id = cursor.lastrowid
        if payload.primary_department_id is not None:
            conn.execute(
                "INSERT OR IGNORE INTO patient_departments "
                "(patient_id, department_id, since_date) VALUES (?, ?, ?)",
                (patient_id, payload.primary_department_id, now),
            )

        if override:
            for suspect in suspects:
                dedup_service.record_dedup_flag(
                    conn,
                    patient_id,
                    suspect.patient_id,
                    suspect.match_type,
                    suspect.similarity,
                    user["id"],
                    x_override_dedup,
                )

        row = _get_patient(conn, patient_id)
        record = serialize_patient(row)
        record["allergies"] = _allergies(conn, patient_id)
        record["departments"] = _departments(conn, patient_id)

    if override:
        write_audit(
            user["id"],
            "patient.dedup_override",
            "patient",
            patient_id,
            {"reason": x_override_dedup, "suspects": [_suspect_dict(s) for s in suspects]},
        )
    write_audit(user["id"], "patient.create", "patient", patient_id, {"mrn": mrn})
    return record


@router.patch("/{patient_id}")
def update_patient(
    patient_id: int,
    payload: PatientUpdate,
    user: dict[str, Any] = Depends(require_patient_write),
) -> dict[str, Any]:
    with get_db() as conn:
        existing = _get_patient(conn, patient_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="Patient not found")

        changes = payload.model_dump(exclude_unset=True)
        if "dob" in changes:
            changes["dob"] = _date_to_ts(changes["dob"])
        if changes:
            columns = ", ".join(f"{key} = ?" for key in changes)
            conn.execute(
                f"UPDATE patients SET {columns}, updated_at = ? WHERE id = ?",
                [*changes.values(), int(datetime.now(UTC).timestamp()), patient_id],
            )
            if payload.primary_department_id is not None:
                conn.execute(
                    "INSERT OR IGNORE INTO patient_departments "
                    "(patient_id, department_id, since_date) VALUES (?, ?, ?)",
                    (patient_id, payload.primary_department_id, int(datetime.now(UTC).timestamp())),
                )
        row = _get_patient(conn, patient_id)
    write_audit(
        user["id"], "patient.update", "patient", patient_id, {"fields": sorted(changes)}
    )
    return serialize_patient(row)


@router.post("/{patient_id}/allergies", status_code=status.HTTP_201_CREATED)
def add_allergy(
    patient_id: int,
    payload: AllergyCreate,
    user: dict[str, Any] = Depends(require_patient_write),
) -> dict[str, Any]:
    with get_db() as conn:
        if _get_patient(conn, patient_id) is None:
            raise HTTPException(status_code=404, detail="Patient not found")
        now = int(datetime.now(UTC).timestamp())
        cursor = conn.execute(
            "INSERT INTO patient_allergies "
            "(patient_id, allergen, severity, reaction, noted_by, noted_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                patient_id,
                payload.allergen,
                payload.severity,
                payload.reaction,
                user["id"],
                now,
            ),
        )
        allergy_id = cursor.lastrowid
        # TODO(#21): the prescription sign endpoint MUST re-check this patient's
        # allergies before allowing a signature; a life_threatening allergen
        # should hard-block the sign flow.
        row = conn.execute(
            "SELECT * FROM patient_allergies WHERE id = ?", (allergy_id,)
        ).fetchone()
    write_audit(
        user["id"],
        "patient.allergy_add",
        "patient",
        patient_id,
        {"allergy_id": allergy_id, "allergen": payload.allergen, "severity": payload.severity},
    )
    return serialize_allergy(row)


@router.delete("/{patient_id}/allergies/{allergy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_allergy(
    patient_id: int,
    allergy_id: int,
    user: dict[str, Any] = Depends(require_patient_admin),
) -> None:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM patient_allergies WHERE id = ? AND patient_id = ?",
            (allergy_id, patient_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Allergy not found")
        conn.execute("DELETE FROM patient_allergies WHERE id = ?", (allergy_id,))
        allergen = row["allergen"]
    write_audit(
        user["id"],
        "patient.allergy_remove",
        "patient",
        patient_id,
        {"allergy_id": allergy_id, "allergen": allergen},
    )


def _safe_rows(conn, sql: str, params: tuple) -> list:
    try:
        return conn.execute(sql, params).fetchall()
    except Exception:
        return []


@router.get("/{patient_id}/timeline")
def patient_timeline(
    patient_id: int,
    user: dict[str, Any] = Depends(require_patient_read),
) -> dict[str, Any]:
    """Cross-department history: visits, prescriptions, vitals, care plan, billing.

    Each source is queried independently and guarded, so a missing/empty
    domain table simply contributes no events instead of failing the request.
    """
    with get_db() as conn:
        if _get_patient(conn, patient_id) is None:
            raise HTTPException(status_code=404, detail="Patient not found")

        events: list[dict[str, Any]] = []

        for r in _safe_rows(
            conn,
            "SELECT a.id, a.scheduled_at AS at, a.reason, a.status, d.name AS dept "
            "FROM appointments a LEFT JOIN departments d ON d.id = a.department_id "
            "WHERE a.patient_id = ?",
            (patient_id,),
        ):
            events.append(
                {
                    "at": _ts_to_iso(r["at"]),
                    "kind": "appointment",
                    "department": r["dept"],
                    "title": "Appointment",
                    "body": r["reason"],
                    "ref_id": r["id"],
                    "status": r["status"],
                }
            )

        for r in _safe_rows(
            conn,
            "SELECT v.id, v.created_at AS at, v.diagnosis, v.chief_complaint, v.status, "
            "d.name AS dept FROM visit_notes v "
            "LEFT JOIN departments d ON d.id = v.department_id WHERE v.patient_id = ?",
            (patient_id,),
        ):
            events.append(
                {
                    "at": _ts_to_iso(r["at"]),
                    "kind": "visit",
                    "department": r["dept"],
                    "title": r["diagnosis"] or "Visit note",
                    "body": r["chief_complaint"],
                    "ref_id": r["id"],
                    "status": r["status"],
                }
            )

        for r in _safe_rows(
            conn,
            "SELECT p.id, p.medication, p.dosage, p.frequency, p.created_at AS at, "
            "d.name AS dept FROM prescriptions p "
            "JOIN visit_notes v ON v.id = p.visit_note_id "
            "LEFT JOIN departments d ON d.id = v.department_id WHERE v.patient_id = ?",
            (patient_id,),
        ):
            events.append(
                {
                    "at": _ts_to_iso(r["at"]),
                    "kind": "prescription",
                    "department": r["dept"],
                    "title": r["medication"],
                    "body": " ".join(filter(None, [r["dosage"], r["frequency"]])),
                    "ref_id": r["id"],
                    "status": None,
                }
            )

        for r in _safe_rows(
            conn,
            "SELECT id, recorded_at AS at, systolic, diastolic, heart_rate, spo2, "
            "temperature_c, respiratory_rate FROM vitals WHERE patient_id = ?",
            (patient_id,),
        ):
            events.append(
                {
                    "at": _ts_to_iso(r["at"]),
                    "kind": "vitals",
                    "department": None,
                    "title": "Vitals recorded",
                    "body": (
                        f"BP {r['systolic']}/{r['diastolic']} · HR {r['heart_rate']} · "
                        f"SpO2 {r['spo2']}%"
                    ),
                    "ref_id": r["id"],
                    "status": None,
                }
            )

        for r in _safe_rows(
            conn,
            "SELECT id, description, due_at, created_at, priority, completed "
            "FROM care_plan_items WHERE patient_id = ?",
            (patient_id,),
        ):
            events.append(
                {
                    "at": _ts_to_iso(r["created_at"] or r["due_at"]),
                    "kind": "care_plan",
                    "department": None,
                    "title": r["description"],
                    "body": f"priority {r['priority']}",
                    "ref_id": r["id"],
                    "status": "completed" if r["completed"] else "open",
                }
            )

        for r in _safe_rows(
            conn,
            "SELECT i.id, i.created_at AS at, i.total_amount, i.status, i.payer_name "
            "FROM invoices i WHERE i.patient_id = ?",
            (patient_id,),
        ):
            events.append(
                {
                    "at": _ts_to_iso(r["at"]),
                    "kind": "billing",
                    "department": None,
                    "title": f"Invoice {r['total_amount']}",
                    "body": r["payer_name"],
                    "ref_id": r["id"],
                    "status": r["status"],
                }
            )

    events = [e for e in events if e["at"]]
    events.sort(key=lambda e: e["at"], reverse=True)
    return {"patient_id": patient_id, "timeline": events}
