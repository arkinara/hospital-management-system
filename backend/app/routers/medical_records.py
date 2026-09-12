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


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [name]
    ).fetchone()
    return row is not None


def _parse_iso(s: str) -> int:
    return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())