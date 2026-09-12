"""Medical records domain router (ticket #21).

Visit notes CRUD, prescriptions, attachments, and the cross-department patient
history endpoint. RBAC: doctor writes visits + prescriptions; nurse reads;
admin moderates.

Schema-adaptive: works against the on-disk visit_notes schema (migration0000 +
incremental additions) by checking which columns exist before referencing them.
This keeps us forward-compatible as more medical-records columns land.
"""
from __future__ import annotations

import re
import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.audit import write_audit
from app.db import get_db as get_conn
from app.dependencies import require_permission, require_role
from app.security import verify_password
from app.services.allergy import RecordedAllergy, match_contraindication

router = APIRouter(prefix="/medical-records", tags=["medical-records"])

ATTACHMENT_STORAGE = (
    Path(__file__).resolve().parents[2] / "storage" / "attachments"
)
ATTACHMENT_STORAGE.mkdir(parents=True, exist_ok=True)
MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
ALLOWED_MIME = {"image/png", "image/jpeg", "application/pdf"}


class VisitIn(BaseModel):
    patient_id: int
    appointment_id: int | None = None
    chief_complaint: str | None = None
    diagnosis: str | None = None
    clinical_notes: str | None = None


class PrescriptionIn(BaseModel):
    medication: str = Field(min_length=1)
    dosage: str | None = None
    frequency: str | None = None
    duration_days: int | None = Field(default=None, ge=1, le=365)


class SignIn(BaseModel):
    password_confirmation: str


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {k: row[k] for k in row.keys()}


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _check_allergy(conn: sqlite3.Connection, patient_id: int, medication_name: str) -> dict | None:
    if not _table_exists(conn, "patient_allergies"):
        # can't check; assume safe
        return None
    rows = conn.execute(
        "SELECT allergen, severity, reaction FROM patient_allergies "
        "WHERE patient_id = ?",
        [patient_id],
    ).fetchall()
    recorded = [
        RecordedAllergy(allergen=r["allergen"], severity=r["severity"], reaction=r["reaction"])
        for r in rows
    ]
    return match_contraindication(medication_name, recorded)


def _contraindicated_prescriptions(
    conn: sqlite3.Connection, visit_id: int, patient_id: int
) -> list[dict]:
    """Every prescription on the visit that clashes with the patient's allergies."""
    if not _table_exists(conn, "prescriptions"):
        return []
    blocked: list[dict] = []
    for rx in conn.execute(
        "SELECT id, medication FROM prescriptions WHERE visit_note_id = ?", [visit_id]
    ).fetchall():
        clash = _check_allergy(conn, patient_id, rx["medication"])
        if clash:
            blocked.append({"id": rx["id"], "medication": rx["medication"], **clash})
    return blocked


# ---------------------------------------------------------------------------
# Visit notes
# ---------------------------------------------------------------------------


@router.get("/patients/{patient_id}/visits")
def list_patient_visits(
    patient_id: int,
    from_: str | None = Query(None, alias="from"),
    to: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    _user=Depends(require_permission("records")),
) -> dict:
    where = ["patient_id = ?"]
    params: list = [patient_id]
    if from_:
        where.append("created_at >= ?")
        params.append(_parse_iso(from_))
    if to:
        where.append("created_at <= ?")
        params.append(_parse_iso(to))
    sql = (
        "SELECT * FROM visit_notes WHERE " + " AND ".join(where)
        + " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    )
    params.extend([limit, offset])
    where_no_pagination = " AND ".join(where)
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
        total = conn.execute(
            f"SELECT COUNT(*) AS c FROM visit_notes WHERE {where_no_pagination}",
            params[:-2],
        ).fetchone()["c"]
    return {"visits": [_row_to_dict(r) for r in rows], "total": total}


@router.get("/visits/{visit_id}")
def get_visit(
    visit_id: int,
    _user=Depends(require_permission("records")),
) -> dict:
    with get_conn() as conn:
        v = conn.execute("SELECT * FROM visit_notes WHERE id = ?", [visit_id]).fetchone()
        if not v:
            raise HTTPException(status_code=404, detail="Visit not found")
        rx = conn.execute(
            "SELECT * FROM prescriptions WHERE visit_note_id = ?", [visit_id]
        ).fetchall()
        att = conn.execute(
            "SELECT * FROM attachments WHERE visit_note_id = ?", [visit_id]
        ).fetchall()
    return {
        "visit": _row_to_dict(v),
        "prescriptions": [_row_to_dict(r) for r in rx],
        "attachments": [_row_to_dict(r) for r in att],
    }


@router.post("/visits", status_code=201)
def create_visit(
    body: VisitIn,
    user=Depends(require_role("doctor", "admin")),
) -> dict:
    user_id = user["id"]
    now = int(datetime.now(UTC).timestamp())
    with get_conn() as conn:
        cols = _table_columns(conn, "visit_notes")
        cols_present = {"appointment_id", "chief_complaint", "diagnosis",
                        "clinical_notes", "status", "created_at"}
        cols_present &= cols  # only those that exist
        if "appointment_id" not in cols:
            # Schema predates #21 — write the columns that exist
            cols_present = {"patient_id", "doctor_id", "chief_complaint",
                            "diagnosis", "clinical_notes", "status", "created_at"} & cols
        # Build INSERT dynamically based on what's available
        col_list = ["patient_id", "doctor_id"] + sorted(c for c in cols_present if c not in {"patient_id", "doctor_id"})
        placeholders = ",".join("?" for _ in col_list)
        sql = f"INSERT INTO visit_notes ({','.join(col_list)}) VALUES ({placeholders})"
        values = {
            "patient_id": body.patient_id, "doctor_id": user_id,
            "appointment_id": body.appointment_id,
            "chief_complaint": body.chief_complaint,
            "diagnosis": body.diagnosis, "clinical_notes": body.clinical_notes,
            "status": "draft", "created_at": now,
        }
        params = [values[c] for c in col_list]
        cur = conn.execute(sql, params)
        visit_id = cur.lastrowid
        # Backfill updated_at, signed_by, is_locked_after_sign if those columns exist
        backfill_cols = []
        backfill_vals = []
        if "updated_at" in cols:
            backfill_cols.append("updated_at = ?"); backfill_vals.append(now)
        if "is_locked_after_sign" in cols:
            backfill_cols.append("is_locked_after_sign = 0")
        if backfill_cols:
            conn.execute(f"UPDATE visit_notes SET {', '.join(backfill_cols)} WHERE id = ?",
                         [*backfill_vals, visit_id])
        write_audit(conn=conn, actor_user_id=user_id, action="record.visit_create",
                    target_type="visit", target_id=visit_id,
                    metadata={"patient_id": body.patient_id})
        visit = conn.execute("SELECT * FROM visit_notes WHERE id = ?", [visit_id]).fetchone()
    return _row_to_dict(visit)


@router.patch("/visits/{visit_id}")
def update_visit(
    visit_id: int,
    body: VisitIn,
    user=Depends(require_role("doctor", "admin")),
) -> dict:
    user_id = user["id"]
    now = int(datetime.now(UTC).timestamp())
    with get_conn() as conn:
        v = conn.execute("SELECT * FROM visit_notes WHERE id = ?", [visit_id]).fetchone()
        if not v:
            raise HTTPException(404, "Visit not found")
        # Sign-lock enforcement if column exists
        if "is_locked_after_sign" in _table_columns(conn, "visit_notes") and v["is_locked_after_sign"]:
            raise HTTPException(409, "Visit is signed and locked; cannot edit")
        cols = _table_columns(conn, "visit_notes")
        sets = []
        params = []
        if "appointment_id" in cols:
            sets.append("appointment_id = ?"); params.append(body.appointment_id)
        for c in ("chief_complaint", "diagnosis", "clinical_notes"):
            sets.append(f"{c} = ?"); params.append(getattr(body, c))
        if "updated_at" in cols:
            sets.append("updated_at = ?"); params.append(now)
        params.append(visit_id)
        conn.execute(f"UPDATE visit_notes SET {', '.join(sets)} WHERE id = ?", params)
        write_audit(conn=conn, actor_user_id=user_id, action="record.visit_update",
                    target_type="visit", target_id=visit_id)
        v = conn.execute("SELECT * FROM visit_notes WHERE id = ?", [visit_id]).fetchone()
    return _row_to_dict(v)


@router.post("/visits/{visit_id}/sign", status_code=204)
def sign_visit(
    visit_id: int,
    body: SignIn,
    user=Depends(require_role("doctor", "admin")),
) -> None:
    user_id = user["id"]
    with get_conn() as conn:
        u = conn.execute("SELECT password_hash FROM users WHERE id = ?", [user_id]).fetchone()
        if not u or not verify_password(body.password_confirmation, u["password_hash"]):
            raise HTTPException(401, "Password confirmation failed")
        v = conn.execute("SELECT * FROM visit_notes WHERE id = ?", [visit_id]).fetchone()
        if not v:
            raise HTTPException(404, "Visit not found")
        if v["signed_at"]:
            raise HTTPException(409, "Already signed")
        # Ticket #40: a visit carrying a contraindicated prescription cannot be
        # signed — reject server-side and name the clash, not just in the UI.
        blocked = _contraindicated_prescriptions(conn, visit_id, v["patient_id"])
        if blocked:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "allergy_contraindication",
                    "message": "Visit has contraindicated prescriptions; cannot sign",
                    "prescriptions": blocked,
                },
            )
        cols = _table_columns(conn, "visit_notes")
        now = int(datetime.now(UTC).timestamp())
        if "signed_by" not in cols or "is_locked_after_sign" not in cols:
            # Older schema without sign columns: just update signed_at
            conn.execute("UPDATE visit_notes SET signed_at = ? WHERE id = ?", [now, visit_id])
        else:
            conn.execute(
                "UPDATE visit_notes SET signed_at=?, signed_by=?, "
                "is_locked_after_sign=1, updated_at=? WHERE id=?",
                [now, user_id, now, visit_id],
            )
        write_audit(conn=conn, actor_user_id=user_id, action="record.visit_sign",
                    target_type="visit", target_id=visit_id)


# ---------------------------------------------------------------------------
# Prescriptions
# ---------------------------------------------------------------------------


@router.post("/visits/{visit_id}/prescriptions", status_code=201)
def create_prescription(
    visit_id: int,
    body: PrescriptionIn,
    user=Depends(require_role("doctor", "admin")),
) -> dict:
    user_id = user["id"]
    with get_conn() as conn:
        v = conn.execute("SELECT * FROM visit_notes WHERE id = ?", [visit_id]).fetchone()
        if not v:
            raise HTTPException(404, "Visit not found")
        if "is_locked_after_sign" in _table_columns(conn, "visit_notes") and v["is_locked_after_sign"]:
            raise HTTPException(409, "Visit is signed and locked")
        block = _check_allergy(conn, v["patient_id"], body.medication)
        if block:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "allergy_contraindication",
                    "message": "Patient allergy blocks this medication",
                    **block,
                },
            )
        now = int(datetime.now(UTC).timestamp())
        cur = conn.execute(
            "INSERT INTO prescriptions (visit_note_id, medication, dosage, frequency, "
            "duration_days, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [visit_id, body.medication, body.dosage, body.frequency,
             body.duration_days, now],
        )
        rx_id = cur.lastrowid
        write_audit(conn=conn, actor_user_id=user_id, action="record.prescription_create",
                    target_type="prescription", target_id=rx_id)
        rx = conn.execute("SELECT * FROM prescriptions WHERE id = ?", [rx_id]).fetchone()
    return _row_to_dict(rx)


@router.get("/prescriptions/{rx_id}")
def get_prescription(
    rx_id: int,
    _user=Depends(require_permission("records")),
) -> dict:
    with get_conn() as conn:
        rx = conn.execute("SELECT * FROM prescriptions WHERE id = ?", [rx_id]).fetchone()
        if not rx:
            raise HTTPException(404, "Prescription not found")
    return _row_to_dict(rx)


@router.delete("/prescriptions/{rx_id}", status_code=204)
def delete_prescription(
    rx_id: int,
    user=Depends(require_role("doctor", "admin")),
) -> None:
    user_id = user["id"]
    with get_conn() as conn:
        rx = conn.execute("SELECT * FROM prescriptions WHERE id = ?", [rx_id]).fetchone()
        if not rx:
            raise HTTPException(404, "Prescription not found")
        conn.execute("DELETE FROM prescriptions WHERE id = ?", [rx_id])
        write_audit(conn=conn, actor_user_id=user_id, action="record.prescription_delete",
                    target_type="prescription", target_id=rx_id)


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------


@router.post("/visits/{visit_id}/attachments", status_code=201)
async def upload_attachment(
    visit_id: int,
    file: UploadFile = File(...),
    description: str | None = Form(default=None),
    user=Depends(require_role("doctor", "nurse", "admin")),
) -> dict:
    user_id = user["id"]
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=415, detail=f"Mime {file.content_type} not allowed")
    contents = await file.read()
    if len(contents) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=413, detail="Attachment too large (>25MB)")
    visit_dir = ATTACHMENT_STORAGE / str(visit_id)
    visit_dir.mkdir(parents=True, exist_ok=True)
    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", file.filename or "upload")
    storage_name = f"{uuid.uuid4().hex[:12]}_{safe_name}"
    storage_path = visit_dir / storage_name
    storage_path.write_bytes(contents)
    now = int(datetime.now(UTC).timestamp())
    with get_conn() as conn:
        v = conn.execute("SELECT id FROM visit_notes WHERE id = ?", [visit_id]).fetchone()
        if not v:
            storage_path.unlink(missing_ok=True)
            raise HTTPException(404, "Visit not found")
        cols = _table_columns(conn, "attachments")
        # Use whatever columns exist
        col_list = []
        values = []
        for c in ("visit_note_id", "file_name", "file_url", "uploaded_by", "created_at"):
            if c in cols:
                col_list.append(c)
        # Map values
        vmap = {
            "visit_note_id": visit_id, "file_name": file.filename,
            "file_url": str(storage_path), "uploaded_by": user_id,
            "created_at": now,
        }
        values = [vmap[c] for c in col_list]
        placeholders = ",".join("?" for _ in col_list)
        cur = conn.execute(
            f"INSERT INTO attachments ({','.join(col_list)}) VALUES ({placeholders})",
            values,
        )
        att_id = cur.lastrowid
        write_audit(conn=conn, actor_user_id=user_id, action="record.attachment_upload",
                    target_type="attachment", target_id=att_id)
        row = conn.execute("SELECT * FROM attachments WHERE id = ?", [att_id]).fetchone()
    return _row_to_dict(row)


@router.get("/attachments/{att_id}/download")
def download_attachment(
    att_id: int,
    user=Depends(require_permission("records")),
):
    with get_conn() as conn:
        att = conn.execute("SELECT * FROM attachments WHERE id = ?", [att_id]).fetchone()
        if not att:
            raise HTTPException(404, "Attachment not found")
    path_str = att["file_url"]
    full_path = Path(path_str)
    if not full_path.is_file():
        raise HTTPException(404, "File missing on disk")
    return FileResponse(full_path, filename=att["file_name"])


# ---------------------------------------------------------------------------
# Cross-department patient history
# ---------------------------------------------------------------------------


@router.get("/patients/{patient_id}/history")
def patient_history(
    patient_id: int,
    _user=Depends(require_permission("records")),
) -> dict:
    events: list[dict] = []
    with get_conn() as conn:
        for v in conn.execute(
            "SELECT id, created_at, signed_at, diagnosis FROM visit_notes "
            "WHERE patient_id = ?", [patient_id]
        ).fetchall():
            events.append({
                "timestamp": v["created_at"], "type": "visit",
                "department_code": None, "summary": v["diagnosis"] or "Visit",
                "source_id": v["id"], "signed": bool(v["signed_at"]),
            })
        if _table_exists(conn, "prescriptions"):
            for r in conn.execute(
                "SELECT id, created_at, medication FROM prescriptions WHERE visit_note_id IN "
                "(SELECT id FROM visit_notes WHERE patient_id = ?)", [patient_id]
            ).fetchall():
                events.append({
                    "timestamp": r["created_at"], "type": "prescription",
                    "department_code": None, "summary": f"Rx: {r['medication']}",
                    "source_id": r["id"], "signed": False,
                })
        if _table_exists(conn, "attachments"):
            for a in conn.execute(
                "SELECT id, created_at, file_name FROM attachments WHERE visit_note_id IN "
                "(SELECT id FROM visit_notes WHERE patient_id = ?)", [patient_id]
            ).fetchall():
                events.append({
                    "timestamp": a["created_at"], "type": "attachment",
                    "department_code": None, "summary": f"Attachment: {a['file_name']}",
                    "source_id": a["id"], "signed": False,
                })
        if _table_exists(conn, "vitals"):
            for vit in conn.execute(
                "SELECT id, recorded_at FROM vitals WHERE patient_id = ?", [patient_id]
            ).fetchall():
                events.append({
                    "timestamp": vit["recorded_at"], "type": "vitals",
                    "department_code": None, "summary": "Vitals reading",
                    "source_id": vit["id"], "signed": False,
                })
        if _table_exists(conn, "care_plan_items"):
            for cp in conn.execute(
                "SELECT id, created_at FROM care_plan_items WHERE patient_id = ?", [patient_id]
            ).fetchall():
                events.append({
                    "timestamp": cp["created_at"], "type": "care_plan",
                    "department_code": None, "summary": "Care plan item",
                    "source_id": cp["id"], "signed": False,
                })
        if _table_exists(conn, "invoices"):
            for inv in conn.execute(
                "SELECT id, created_at, payer_name FROM invoices WHERE patient_id = ?",
                [patient_id],
            ).fetchall():
                events.append({
                    "timestamp": inv["created_at"], "type": "billing",
                    "department_code": None,
                    "summary": f"Invoice ({inv['payer_name']})",
                    "source_id": inv["id"], "signed": False,
                })
    events.sort(key=lambda e: e["timestamp"] or 0, reverse=True)
    return {"patient_id": patient_id, "events": events}


# ---------------------------------------------------------------------------
# Vitals capture, review queue & trend (ticket #41)
# ---------------------------------------------------------------------------

VITALS_FIELDS = [
    "systolic",
    "diastolic",
    "heart_rate",
    "spo2",
    "temperature_c",
    "respiratory_rate",
]

VITALS_RANGES: dict[str, tuple[float, float]] = {
    "systolic": (50.0, 250.0),
    "diastolic": (30.0, 150.0),
    "heart_rate": (30.0, 220.0),
    "spo2": (50.0, 100.0),
    "temperature_c": (30.0, 45.0),
    "respiratory_rate": (5.0, 60.0),
}


class VitalsIn(BaseModel):
    systolic: float
    diastolic: float
    heart_rate: float
    spo2: float
    temperature_c: float
    respiratory_rate: float
    appointment_id: int | None = None
    note: str | None = None


def _is_critical_reading(row) -> bool:
    systolic = row["systolic"]
    spo2 = row["spo2"]
    hr = row["heart_rate"]
    if systolic is not None and systolic > 180:
        return True
    if spo2 is not None and spo2 < 90:
        return True
    if hr is not None and (hr > 130 or hr < 40):
        return True
    return False


def _serialize_vitals(row) -> dict:
    data = _row_to_dict(row)
    data["recorded_at_iso"] = _parse_iso_rev(row["recorded_at"])
    data["critical"] = _is_critical_reading(row)
    return data


def _parse_iso_rev(epoch: int) -> str:
    return datetime.fromtimestamp(int(epoch), UTC).isoformat()


def _out_of_range_fields(body: VitalsIn) -> list[str]:
    bad: list[str] = []
    for field, (low, high) in VITALS_RANGES.items():
        value = getattr(body, field)
        if value is not None and not (low <= value <= high):
            bad.append(field)
    return bad


@router.post("/patients/{patient_id}/vitals", status_code=201)
def create_vitals(
    patient_id: int,
    body: VitalsIn,
    user=Depends(require_role("doctor", "nurse", "admin")),
) -> dict:
    user_id = user["id"]
    bad = _out_of_range_fields(body)
    if bad:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "vitals_out_of_range",
                "message": "Vitals values outside plausible range",
                "fields": bad,
                "ranges": {f: VITALS_RANGES[f] for f in bad},
            },
        )
    now = int(datetime.now(UTC).timestamp())
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM patients WHERE id = ?", [patient_id]).fetchone():
            raise HTTPException(404, "Patient not found")
        if body.appointment_id is not None and not conn.execute(
            "SELECT 1 FROM appointments WHERE id = ?", [body.appointment_id]
        ).fetchone():
            raise HTTPException(404, "Appointment not found")
        cur = conn.execute(
            "INSERT INTO vitals (patient_id, appointment_id, systolic, diastolic, "
            "heart_rate, spo2, temperature_c, respiratory_rate, note, recorded_by, "
            "recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                patient_id,
                body.appointment_id,
                body.systolic,
                body.diastolic,
                body.heart_rate,
                body.spo2,
                body.temperature_c,
                body.respiratory_rate,
                body.note,
                user_id,
                now,
            ],
        )
        vital_id = cur.lastrowid
        write_audit(conn=conn, actor_user_id=user_id, action="vital.create",
                    target_type="vital", target_id=vital_id,
                    metadata={"patient_id": patient_id})
        row = conn.execute("SELECT * FROM vitals WHERE id = ?", [vital_id]).fetchone()
    return _serialize_vitals(row)


@router.get("/patients/{patient_id}/vitals")
def list_vitals(
    patient_id: int,
    from_: str | None = Query(None, alias="from"),
    to: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    _user=Depends(require_permission("records")),
) -> dict:
    where = ["patient_id = ?"]
    params: list = [patient_id]
    if from_:
        where.append("recorded_at >= ?")
        params.append(_parse_iso(from_))
    if to:
        where.append("recorded_at <= ?")
        params.append(_parse_iso(to))
    if from_ and to and _parse_iso(from_) > _parse_iso(to):
        raise HTTPException(422, "from must be on or before to")
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM patients WHERE id = ?", [patient_id]).fetchone():
            raise HTTPException(404, "Patient not found")
        rows = conn.execute(
            "SELECT * FROM vitals WHERE " + " AND ".join(where)
            + " ORDER BY recorded_at DESC, id DESC LIMIT ?",
            params + [limit],
        ).fetchall()
    return {"patient_id": patient_id, "vitals": [_serialize_vitals(r) for r in rows]}


@router.get("/vitals/review-queue")
def vitals_review_queue(
    department_id: int | None = None,
    _user=Depends(require_role("doctor", "admin")),
) -> dict:
    now = int(datetime.now(UTC).timestamp())
    since = now - 24 * 3600
    with get_conn() as conn:
        cols = _table_columns(conn, "vitals")
        unacked = "v.acknowledged_at IS NULL" if "acknowledged_at" in cols else "1=1"
        sql = (
            "SELECT v.* FROM vitals v JOIN patients p ON p.id = v.patient_id "
            "WHERE v.recorded_at >= ? AND " + unacked + " "
            "AND (v.systolic > 180 OR v.spo2 < 90 OR v.heart_rate > 130 OR v.heart_rate < 40)"
        )
        params: list = [since]
        if department_id is not None:
            sql += " AND p.primary_department_id = ?"
            params.append(department_id)
        sql += " ORDER BY v.recorded_at DESC"
        rows = conn.execute(sql, params).fetchall()
    return {
        "queue": [_serialize_vitals(r) for r in rows],
        "window_hours": 24,
        "count": len(rows),
    }


@router.post("/vitals/{vital_id}/acknowledge")
def acknowledge_vital(
    vital_id: int,
    user=Depends(require_role("doctor", "admin")),
) -> dict:
    user_id = user["id"]
    now = int(datetime.now(UTC).timestamp())
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM vitals WHERE id = ?", [vital_id]).fetchone()
        if not row:
            raise HTTPException(404, "Vital reading not found")
        cols = _table_columns(conn, "vitals")
        if "acknowledged_at" in cols and row["acknowledged_at"] is not None:
            raise HTTPException(409, "Reading already acknowledged")
        conn.execute(
            "UPDATE vitals SET acknowledged_at = ?, acknowledged_by = ? WHERE id = ?",
            [now, user_id, vital_id],
        )
        write_audit(conn=conn, actor_user_id=user_id, action="vital.acknowledge",
                    target_type="vital", target_id=vital_id)
        row = conn.execute("SELECT * FROM vitals WHERE id = ?", [vital_id]).fetchone()
    return _serialize_vitals(row)


TREND_METRICS = {"systolic": "systolic", "spo2": "spo2", "hr": "heart_rate"}


@router.get("/patients/{patient_id}/vitals/trend")
def vitals_trend(
    patient_id: int,
    metric: str = Query(..., description="systolic|spo2|hr"),
    from_: str | None = Query(None, alias="from"),
    to: str | None = Query(None),
    _user=Depends(require_permission("records")),
) -> dict:
    column = TREND_METRICS.get(metric)
    if column is None:
        raise HTTPException(422, f"metric must be one of {sorted(TREND_METRICS)}")
    params: list = [patient_id]
    if from_:
        params.append(_parse_iso(from_))
    if to:
        params.append(_parse_iso(to))
    if from_ and to and _parse_iso(from_) > _parse_iso(to):
        raise HTTPException(422, "from must be on or before to")
    where = ["patient_id = ?"]
    if from_:
        where.append("recorded_at >= ?")
    if to:
        where.append("recorded_at <= ?")
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM patients WHERE id = ?", [patient_id]).fetchone():
            raise HTTPException(404, "Patient not found")
        rows = conn.execute(
            "SELECT recorded_at, " + column + " AS value FROM vitals WHERE "
            + " AND ".join(where) + f" AND {column} IS NOT NULL ORDER BY recorded_at ASC",
            params,
        ).fetchall()
    return {
        "patient_id": patient_id,
        "metric": metric,
        "series": [
            {"recorded_at": _parse_iso_rev(r["recorded_at"]), "value": r["value"]}
            for r in rows
        ],
    }


# ---------------------------------------------------------------------------
# Care plan items & shift handover (ticket #42)
# ---------------------------------------------------------------------------

CARE_PLAN_PRIORITIES = {"critical", "urgent", "high", "normal", "low"}

_PRIORITY_RANK = {"critical": 0, "urgent": 1, "high": 2, "normal": 3, "low": 4}


def _care_plan_sort_key(item) -> tuple[int, int | None]:
    return (_PRIORITY_RANK.get(item["priority"], 99), item["due_at"])


class CarePlanIn(BaseModel):
    description: str = Field(min_length=1)
    priority: str
    due_at: datetime | None = None
    source_visit_note_id: int | None = None


class CarePlanPatch(BaseModel):
    description: str | None = Field(default=None, min_length=1)
    priority: str | None = None
    due_at: datetime | None = None
    completed: bool | None = None


class CarePlanReassign(BaseModel):
    assigned_to: int


def _validate_priority(priority: str) -> None:
    if priority.lower() not in CARE_PLAN_PRIORITIES:
        raise HTTPException(422, f"priority must be one of {sorted(CARE_PLAN_PRIORITIES)}")


def _care_item_to_dict(row) -> dict:
    data = _row_to_dict(row)
    data["due_at"] = _parse_iso_rev(row["due_at"]) if row["due_at"] else None
    return data


@router.get("/patients/{patient_id}/care-plan")
def list_care_plan(
    patient_id: int,
    _user=Depends(require_permission("records")),
) -> dict:
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM patients WHERE id = ?", [patient_id]).fetchone():
            raise HTTPException(404, "Patient not found")
        rows = conn.execute(
            "SELECT * FROM care_plan_items WHERE patient_id = ? AND completed = 0",
            [patient_id],
        ).fetchall()
    items = [_care_item_to_dict(r) for r in rows]
    items.sort(key=_care_plan_sort_key)
    return {"patient_id": patient_id, "items": items}


@router.post("/patients/{patient_id}/care-plan", status_code=201)
def create_care_plan_item(
    patient_id: int,
    body: CarePlanIn,
    user=Depends(require_role("doctor", "nurse", "admin")),
) -> dict:
    user_id = user["id"]
    _validate_priority(body.priority)
    due_at = int(body.due_at.timestamp()) if body.due_at else None
    if due_at is not None and due_at < int(datetime.now(UTC).timestamp()):
        raise HTTPException(422, "due_at cannot be in the past")
    now = int(datetime.now(UTC).timestamp())
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM patients WHERE id = ?", [patient_id]).fetchone():
            raise HTTPException(404, "Patient not found")
        if body.source_visit_note_id is not None and not conn.execute(
            "SELECT 1 FROM visit_notes WHERE id = ?", [body.source_visit_note_id]
        ).fetchone():
            raise HTTPException(404, "Source visit note not found")
        cols = _table_columns(conn, "care_plan_items")
        col_map = {
            "patient_id": patient_id,
            "source_visit_note_id": body.source_visit_note_id,
            "description": body.description,
            "due_at": due_at,
            "priority": body.priority.lower(),
            "completed": 0,
            "created_by": user_id,
            "created_at": now,
        }
        names = [c for c in col_map if c in cols]
        ph = ",".join("?" for _ in names)
        cur = conn.execute(
            f"INSERT INTO care_plan_items ({','.join(names)}) VALUES ({ph})",
            [col_map[c] for c in names],
        )
        item_id = cur.lastrowid
        write_audit(conn=conn, actor_user_id=user_id, action="care_plan.create",
                    target_type="care_plan_item", target_id=item_id,
                    metadata={"patient_id": patient_id})
        row = conn.execute("SELECT * FROM care_plan_items WHERE id = ?", [item_id]).fetchone()
    return _care_item_to_dict(row)


@router.patch("/care-plan/{item_id}")
def update_care_plan_item(
    item_id: int,
    body: CarePlanPatch,
    user=Depends(require_role("doctor", "nurse", "admin")),
) -> dict:
    user_id = user["id"]
    if body.priority is not None:
        _validate_priority(body.priority)
    due_at = int(body.due_at.timestamp()) if body.due_at is not None else None
    if due_at is not None and due_at < int(datetime.now(UTC).timestamp()):
        raise HTTPException(422, "due_at cannot be in the past")
    now = int(datetime.now(UTC).timestamp())
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM care_plan_items WHERE id = ?", [item_id]).fetchone()
        if not row:
            raise HTTPException(404, "Care plan item not found")
        sets: list[str] = []
        params: list = []
        if body.description is not None:
            sets.append("description = ?"); params.append(body.description)
        if body.priority is not None:
            sets.append("priority = ?"); params.append(body.priority.lower())
        if due_at is not None:
            sets.append("due_at = ?"); params.append(due_at)
        if body.completed is not None:
            sets.append("completed = ?")
            params.append(int(body.completed))
            if body.completed:
                sets.append("completed_by = ?"); params.append(user_id)
                sets.append("completed_at = ?"); params.append(now)
            else:
                sets.append("completed_by = NULL")
                sets.append("completed_at = NULL")
        if sets:
            params.append(item_id)
            conn.execute(f"UPDATE care_plan_items SET {', '.join(sets)} WHERE id = ?", params)
        write_audit(conn=conn, actor_user_id=user_id, action="care_plan.update",
                    target_type="care_plan_item", target_id=item_id)
        row = conn.execute("SELECT * FROM care_plan_items WHERE id = ?", [item_id]).fetchone()
    return _care_item_to_dict(row)


@router.post("/care-plan/{item_id}/complete")
def complete_care_plan_item(
    item_id: int,
    user=Depends(require_role("doctor", "nurse", "admin")),
) -> dict:
    user_id = user["id"]
    now = int(datetime.now(UTC).timestamp())
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM care_plan_items WHERE id = ?", [item_id]).fetchone()
        if not row:
            raise HTTPException(404, "Care plan item not found")
        if row["completed"]:
            raise HTTPException(409, "Care plan item already completed")
        conn.execute(
            "UPDATE care_plan_items SET completed = 1, completed_by = ?, completed_at = ? "
            "WHERE id = ?",
            [user_id, now, item_id],
        )
        write_audit(conn=conn, actor_user_id=user_id, action="care_plan.complete",
                    target_type="care_plan_item", target_id=item_id)
        row = conn.execute("SELECT * FROM care_plan_items WHERE id = ?", [item_id]).fetchone()
    return _care_item_to_dict(row)


@router.post("/care-plan/{item_id}/reassign")
def reassign_care_plan_item(
    item_id: int,
    body: CarePlanReassign,
    user=Depends(require_role("doctor", "nurse", "admin")),
) -> dict:
    user_id = user["id"]
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM care_plan_items WHERE id = ?", [item_id]).fetchone()
        if not row:
            raise HTTPException(404, "Care plan item not found")
        target = conn.execute(
            "SELECT role FROM users WHERE id = ?", [body.assigned_to]
        ).fetchone()
        if not target:
            raise HTTPException(404, "Target user not found")
        if target["role"] != "nurse":
            raise HTTPException(422, "assigned_to must reference a nurse account")
        cols = _table_columns(conn, "care_plan_items")
        if "assigned_to" not in cols:
            raise HTTPException(409, "Care plan reassignment not supported on this schema")
        conn.execute("UPDATE care_plan_items SET assigned_to = ? WHERE id = ?",
                     [body.assigned_to, item_id])
        write_audit(conn=conn, actor_user_id=user_id, action="care_plan.reassign",
                    target_type="care_plan_item", target_id=item_id,
                    metadata={"assigned_to": body.assigned_to})
        row = conn.execute("SELECT * FROM care_plan_items WHERE id = ?", [item_id]).fetchone()
    return _care_item_to_dict(row)


@router.get("/care-plan/shift-handover")
def shift_handover(
    from_user_id: int = Query(...),
    to_user_id: int | None = Query(None),
    shift_date: str = Query(..., description="YYYY-MM-DD"),
    user=Depends(require_role("doctor", "nurse", "admin")),
) -> dict:
    if user["role"] == "nurse" and user["id"] != from_user_id:
        raise HTTPException(403, "Forbidden")
    try:
        datetime.strptime(shift_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(422, "shift_date must be YYYY-MM-DD") from None
    from app.services.patient_assignment import assignments_for_user_on_date

    with get_conn() as conn:
        assignments = assignments_for_user_on_date(conn, from_user_id, shift_date)
        patient_rows: dict[int, sqlite3.Row] = {}
        for a in assignments:
            p = conn.execute("SELECT * FROM patients WHERE id = ?", [a["patient_id"]]).fetchone()
            if p is not None:
                patient_rows[p["id"]] = p
        patients: list[dict] = []
        for pid, p in patient_rows.items():
            items = [
                _care_item_to_dict(r)
                for r in conn.execute(
                    "SELECT * FROM care_plan_items WHERE patient_id = ? AND completed = 0",
                    [pid],
                ).fetchall()
            ]
            items.sort(key=_care_plan_sort_key)
            patients.append({
                "id": p["id"],
                "mrn": p["mrn"],
                "full_name": p["full_name"],
                "acuity": p["acuity"],
                "admission_status": p["admission_status"],
                "primary_department_id": p["primary_department_id"],
                "open_items": items,
                "open_item_count": len(items),
            })
        patients.sort(key=lambda x: x["full_name"])
        write_audit(conn=conn, actor_user_id=user["id"], action="care_plan.handover",
                    target_type="patient_assignment", target_id=None,
                    metadata={"from_user_id": from_user_id, "to_user_id": to_user_id,
                              "shift_date": shift_date, "patient_count": len(patients)})
    return {
        "shift_date": shift_date,
        "from_user_id": from_user_id,
        "to_user_id": to_user_id,
        "patients": patients,
    }


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [name]
    ).fetchone()
    return row is not None


def _parse_iso(s: str) -> int:
    return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())