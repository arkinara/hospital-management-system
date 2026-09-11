"""Billing domain router (ticket #22).

Invoices, line items, payments, insurance claims. The invoice enum and the
claim enum are SEPARATE per PRD:

- Invoice: draft / unpaid / partially_paid / paid / void
- Claim:   none / draft / submitted / in_review / approved / denied / settled

An invoice is never "denied"; that's a claim status. A claim carries
denial_reason + appeal_deadline so denials can be worked.
"""
from __future__ import annotations

import sqlite3
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.audit import write_audit
from app.db import get_db as get_conn
from app.dependencies import require_permission, require_role

router = APIRouter(prefix="/billing", tags=["billing"])

INVOICE_STATUSES = {"draft", "unpaid", "partially_paid", "paid", "void"}
CLAIM_STATUSES = {"none", "draft", "submitted", "in_review", "approved", "denied", "settled"}
PAYMENT_METHODS = {"cash", "card", "insurance", "other"}


class LineItemIn(BaseModel):
    code: str | None = None
    description: str = Field(min_length=1)
    quantity: int = Field(default=1, ge=1)
    unit_amount: float = Field(ge=0)


class InvoiceIn(BaseModel):
    patient_id: int
    visit_note_id: int | None = None
    payer_name: str | None = None
    line_items: list[LineItemIn] = Field(min_length=1)


class PaymentIn(BaseModel):
    amount: float = Field(gt=0)
    method: str = Field(min_length=1)
    reference: str | None = None


class ClaimIn(BaseModel):
    payer_name: str = Field(min_length=1)
    claim_number: str | None = None


class ClaimPatchIn(BaseModel):
    status: str
    denial_reason: str | None = None
    appeal_deadline: str | None = None  # ISO date


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {k: row[k] for k in row.keys()}


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _gen_invoice_number(conn: sqlite3.Connection, now: int) -> str:
    # INV-YYYY-NNNN using count of current year invoices
    cols = _table_columns(conn, "invoices")
    yr_prefix = f"INV-{datetime.now(UTC).year}-"
    if "invoice_number" in cols:
        # Production path
        last = conn.execute(
            "SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? "
            "ORDER BY invoice_number DESC LIMIT 1", [f"{yr_prefix}%"]
        ).fetchone()
        n = int(last["invoice_number"].rsplit("-", 1)[1]) + 1 if last else 1
        return f"{yr_prefix}{n:04d}"
    # Fallback when invoice_number column doesn't exist: skip generation
    return ""


@router.get("/invoices")
def list_invoices(
    patient_id: int | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    _user=Depends(require_permission("billing")),
) -> dict:
    where = []
    params: list = []
    if patient_id:
        where.append("patient_id = ?")
        params.append(patient_id)
    if status:
        if status not in INVOICE_STATUSES:
            raise HTTPException(400, f"Invalid status; must be one of {INVOICE_STATUSES}")
        where.append("status = ?")
        params.append(status)
    sql = "SELECT * FROM invoices"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return {"invoices": [_row_to_dict(r) for r in rows]}


@router.get("/invoices/{invoice_id}")
def get_invoice(
    invoice_id: int,
    _user=Depends(require_permission("billing")),
) -> dict:
    with get_conn() as conn:
        inv = conn.execute("SELECT * FROM invoices WHERE id = ?", [invoice_id]).fetchone()
        if not inv:
            raise HTTPException(404, "Invoice not found")
        lines = conn.execute(
            "SELECT * FROM invoice_line_items WHERE invoice_id = ?", [invoice_id]
        ).fetchall()
        pays = conn.execute(
            "SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_at DESC",
            [invoice_id],
        ).fetchall()
        claims = conn.execute(
            "SELECT * FROM insurance_claims WHERE invoice_id = ?", [invoice_id]
        ).fetchall()
    return {
        "invoice": _row_to_dict(inv),
        "line_items": [_row_to_dict(r) for r in lines],
        "payments": [_row_to_dict(r) for r in pays],
        "claims": [_row_to_dict(r) for r in claims],
    }


def _update_status_from_payments(conn: sqlite3.Connection, invoice_id: int) -> None:
    inv = conn.execute("SELECT * FROM invoices WHERE id = ?", [invoice_id]).fetchone()
    if not inv:
        return
    if inv["status"] == "void":
        return
    total = inv["total_amount"]
    paid_row = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE invoice_id = ?",
        [invoice_id],
    ).fetchone()
    paid = paid_row["s"]
    if paid <= 0:
        new_status = "unpaid"
    elif paid < total:
        new_status = "partially_paid"
    else:
        new_status = "paid"
    if new_status != inv["status"]:
        conn.execute(
            "UPDATE invoices SET status = ? WHERE id = ?", [new_status, invoice_id]
        )


@router.post("/invoices", status_code=201)
def create_invoice(
    body: InvoiceIn,
    user=Depends(require_role("receptionist", "admin")),
) -> dict:
    user_id = user["id"]
    total = sum(li.quantity * li.unit_amount for li in body.line_items)
    now = int(datetime.now(UTC).timestamp())
    with get_conn() as conn:
        cols = _table_columns(conn, "invoices")
        # Build column list dynamically
        col_list = []
        values = []
        for c in ("patient_id", "visit_note_id", "payer_name", "total_amount",
                  "amount_paid", "status", "created_at"):
            if c in cols:
                col_list.append(c)
        vmap = {
            "patient_id": body.patient_id, "visit_note_id": body.visit_note_id,
            "payer_name": body.payer_name, "total_amount": total,
            "amount_paid": 0.0, "status": "draft", "created_at": now,
        }
        values = [vmap[c] for c in col_list]
        placeholders = ",".join("?" for _ in col_list)
        cur = conn.execute(
            f"INSERT INTO invoices ({','.join(col_list)}) VALUES ({placeholders})",
            values,
        )
        invoice_id = cur.lastrowid
        # Add invoice_number after insert (column exists in newer schema only)
        if "invoice_number" in cols:
            number = _gen_invoice_number(conn, now)
            conn.execute(
                "UPDATE invoices SET invoice_number = ? WHERE id = ?",
                [number, invoice_id],
            )
        # Insert line items
        if conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_line_items'"
        ).fetchone():
            li_cols = _table_columns(conn, "invoice_line_items")
            for li in body.line_items:
                col_list_li = []
                vmap_li = {
                    "invoice_id": invoice_id, "code": li.code or "",
                    "description": li.description, "quantity": li.quantity,
                    "unit_amount": li.unit_amount,
                    "item_type": "", "department_id": None,
                }
                for c in ("invoice_id", "code", "description", "quantity",
                          "unit_amount", "item_type", "department_id"):
                    if c in li_cols:
                        col_list_li.append(c)
                vals_li = [vmap_li[c] for c in col_list_li]
                placeholders_li = ",".join("?" for _ in col_list_li)
                conn.execute(
                    f"INSERT INTO invoice_line_items ({','.join(col_list_li)}) "
                    f"VALUES ({placeholders_li})",
                    vals_li,
                )
        write_audit(conn=conn, actor_user_id=user_id, action="billing.invoice_create",
                    target_type="invoice", target_id=invoice_id,
                    metadata={"total": total})
        inv = conn.execute("SELECT * FROM invoices WHERE id = ?", [invoice_id]).fetchone()
    return _row_to_dict(inv)


@router.post("/invoices/{invoice_id}/void")
def void_invoice(
    invoice_id: int,
    user=Depends(require_role("admin")),
) -> dict:
    user_id = user["id"]
    now = int(datetime.now(UTC).timestamp())
    with get_conn() as conn:
        inv = conn.execute("SELECT * FROM invoices WHERE id = ?", [invoice_id]).fetchone()
        if not inv:
            raise HTTPException(404, "Invoice not found")
        if inv["status"] == "void":
            raise HTTPException(409, "Already voided")
        conn.execute("UPDATE invoices SET status = 'void' WHERE id = ?", [invoice_id])
        write_audit(conn=conn, actor_user_id=user_id, action="billing.invoice_void",
                    target_type="invoice", target_id=invoice_id)
        inv = conn.execute("SELECT * FROM invoices WHERE id = ?", [invoice_id]).fetchone()
    return _row_to_dict(inv)


@router.post("/invoices/{invoice_id}/payments", status_code=201)
def add_payment(
    invoice_id: int,
    body: PaymentIn,
    user=Depends(require_role("receptionist", "admin")),
) -> dict:
    user_id = user["id"]
    if body.method not in PAYMENT_METHODS:
        raise HTTPException(400, f"Invalid method; must be one of {PAYMENT_METHODS}")
    now = int(datetime.now(UTC).timestamp())
    with get_conn() as conn:
        inv = conn.execute("SELECT * FROM invoices WHERE id = ?", [invoice_id]).fetchone()
        if not inv:
            raise HTTPException(404, "Invoice not found")
        if inv["status"] == "void":
            raise HTTPException(409, "Cannot pay a voided invoice")
        if inv["status"] == "draft":
            raise HTTPException(409, "Finalise invoice before payment (status=draft)")
        cur = conn.execute(
            "INSERT INTO payments (invoice_id, amount, method, reference, paid_at) "
            "VALUES (?, ?, ?, ?, ?)",
            [invoice_id, body.amount, body.method, body.reference, now],
        )
        payment_id = cur.lastrowid
        # Update amount_paid + status
        conn.execute(
            "UPDATE invoices SET amount_paid = amount_paid + ? WHERE id = ?",
            [body.amount, invoice_id],
        )
        _update_status_from_payments(conn, invoice_id)
        write_audit(conn=conn, actor_user_id=user_id, action="billing.payment_create",
                    target_type="payment", target_id=payment_id)
        row = conn.execute("SELECT * FROM payments WHERE id = ?", [payment_id]).fetchone()
    return _row_to_dict(row)


@router.post("/invoices/{invoice_id}/claim", status_code=201)
def create_claim(
    invoice_id: int,
    body: ClaimIn,
    user=Depends(require_role("receptionist", "admin")),
) -> dict:
    user_id = user["id"]
    with get_conn() as conn:
        inv = conn.execute("SELECT * FROM invoices WHERE id = ?", [invoice_id]).fetchone()
        if not inv:
            raise HTTPException(404, "Invoice not found")
        cur = conn.execute(
            "INSERT INTO insurance_claims (invoice_id, payer_name, claim_number, status) "
            "VALUES (?, ?, ?, 'draft')",
            [invoice_id, body.payer_name, body.claim_number],
        )
        claim_id = cur.lastrowid
        write_audit(conn=conn, actor_user_id=user_id, action="billing.claim_create",
                    target_type="claim", target_id=claim_id)
        row = conn.execute("SELECT * FROM insurance_claims WHERE id = ?", [claim_id]).fetchone()
    return _row_to_dict(row)


@router.patch("/claims/{claim_id}")
def update_claim(
    claim_id: int,
    body: ClaimPatchIn,
    user=Depends(require_role("receptionist", "admin")),
) -> dict:
    user_id = user["id"]
    if body.status not in CLAIM_STATUSES:
        raise HTTPException(400, f"Invalid status; must be one of {CLAIM_STATUSES}")
    with get_conn() as conn:
        claim = conn.execute(
            "SELECT * FROM insurance_claims WHERE id = ?", [claim_id]
        ).fetchone()
        if not claim:
            raise HTTPException(404, "Claim not found")
        # Status flow guards
        if body.status == "denied" and not body.denial_reason:
            raise HTTPException(400, "denial_reason required when status=denied")
        if body.status in ("approved", "denied") and claim["status"] not in (
            "submitted", "in_review"
        ):
            raise HTTPException(409, f"Cannot transition from {claim['status']} to {body.status}")
        now = int(datetime.now(UTC).timestamp())
        submitted = claim["submitted_at"]
        submitted_at = submitted
        if body.status == "submitted" and not submitted:
            submitted_at = now
        decided_at = now if body.status in ("approved", "denied", "settled") else None
        cols = _table_columns(conn, "insurance_claims")
        sets = ["status = ?"]
        params = [body.status]
        if "denial_reason" in cols:
            sets.append("denial_reason = ?")
            params.append(body.denial_reason)
        if "appeal_deadline" in cols and body.appeal_deadline:
            try:
                ad = int(datetime.fromisoformat(body.appeal_deadline.replace("Z", "+00:00")).timestamp())
            except Exception:
                raise HTTPException(400, "appeal_deadline must be ISO date")
            sets.append("appeal_deadline = ?")
            params.append(ad)
        if "submitted_at" in cols:
            sets.append("submitted_at = ?"); params.append(submitted_at)
        if "decided_at" in cols:
            sets.append("decided_at = ?"); params.append(decided_at)
        params.append(claim_id)
        conn.execute(f"UPDATE insurance_claims SET {', '.join(sets)} WHERE id = ?", params)
        write_audit(conn=conn, actor_user_id=user_id, action=f"billing.claim_{body.status}",
                    target_type="claim", target_id=claim_id)
        row = conn.execute("SELECT * FROM insurance_claims WHERE id = ?", [claim_id]).fetchone()
    return _row_to_dict(row)


@router.get("/claims")
def list_claims(
    invoice_id: int | None = Query(None),
    status: str | None = Query(None),
    appeal_due_before: str | None = Query(None),
    _user=Depends(require_permission("billing")),
) -> dict:
    where = []
    params: list = []
    if invoice_id:
        where.append("invoice_id = ?")
        params.append(invoice_id)
    if status:
        if status not in CLAIM_STATUSES:
            raise HTTPException(400, f"Invalid status; must be one of {CLAIM_STATUSES}")
        where.append("status = ?")
        params.append(status)
    if appeal_due_before:
        try:
            ts = int(datetime.fromisoformat(appeal_due_before.replace("Z", "+00:00")).timestamp())
            where.append("(status = 'denied' AND appeal_deadline IS NOT NULL AND appeal_deadline <= ?)")
            params.append(ts)
        except Exception:
            raise HTTPException(400, "appeal_due_before must be ISO date")
    sql = "SELECT * FROM insurance_claims"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY id DESC"
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return {"claims": [_row_to_dict(r) for r in rows]}


@router.get("/claims/{claim_id}")
def get_claim(
    claim_id: int,
    _user=Depends(require_permission("billing")),
) -> dict:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM insurance_claims WHERE id = ?", [claim_id]
        ).fetchone()
        if not row:
            raise HTTPException(404, "Claim not found")
    return _row_to_dict(row)