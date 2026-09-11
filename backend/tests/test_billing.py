"""Tests for the billing domain (ticket #22).

Invoices, payments, insurance claims. Invoice enum and claim enum are separate
per PRD: invoices have draft/unpaid/partially_paid/paid/void; claims have
none/draft/submitted/in_review/approved/denied/settled.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from test_auth import _db_conn, bearer, client, login

ADMIN = ("admin@hospital.test", "Hospital2025!")
DOCTOR = ("doctor@hospital.test", "Hospital2025!")
RECEPTIONIST = ("receptionist@hospital.test", "Hospital2025!")


def _admin_h():
    return bearer(login(*ADMIN)["access_token"])


def _recept_h():
    return bearer(login(*RECEPTIONIST)["access_token"])


def _doctor_h():
    return bearer(login(*DOCTOR)["access_token"])


def _patient_with_visit(h_recept=None, h_doctor=None):
    """Create a patient + a visit so we can attach an invoice."""
    h = _admin_h()
    unique = uuid.uuid4().hex[:10]
    nat_id = f"3174{uuid.uuid4().int & 0xFFFFFFFFFFFF:012d}"
    r = client.post(
        "/patients",
        headers=h,
        json={
            "national_id": nat_id,
            "full_name": f"Billing Test {unique}",
            "dob": "1990-01-01",
            "phone": f"081{uuid.uuid4().int & 0xFFFFFFF:07d}",
            "email": f"{unique}@test.local",
            "acuity": "standard",
            "admission_status": "outpatient",
        },
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    if h_doctor:
        vr = client.post(
            "/medical-records/visits", headers=h_doctor,
            json={"patient_id": pid, "chief_complaint": "x"},
        )
        assert vr.status_code == 201
        return pid, vr.json()["id"]
    return pid, None


def test_create_invoice_returns_201_with_total():
    h = _recept_h()
    pid, _ = _patient_with_visit()
    body = {
        "patient_id": pid,
        "payer_name": "Acme Insurance",
        "line_items": [
            {"description": "Consultation", "quantity": 1, "unit_amount": 100.0},
            {"description": "Lab work", "quantity": 2, "unit_amount": 50.0},
        ],
    }
    r = client.post("/billing/invoices", headers=h, json=body)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["total_amount"] == 200.0
    assert data["status"] == "draft"


def test_invoice_requires_line_items():
    h = _recept_h()
    pid, _ = _patient_with_visit()
    r = client.post(
        "/billing/invoices", headers=h,
        json={"patient_id": pid, "line_items": []},
    )
    assert r.status_code == 422


def test_payment_full_marks_invoice_paid():
    h = _recept_h()
    pid, _ = _patient_with_visit()
    inv = client.post("/billing/invoices", headers=h, json={
        "patient_id": pid,
        "line_items": [{"description": "x", "unit_amount": 100}],
    }).json()
    iid = inv["id"]
    # Move out of draft first (the payment refuses on draft)
    with _db_conn() as conn:
        conn.execute("UPDATE invoices SET status = 'unpaid' WHERE id = ?", [iid])
    pr = client.post(
        f"/billing/invoices/{iid}/payments", headers=h,
        json={"amount": 100.0, "method": "cash"},
    )
    assert pr.status_code == 201, pr.text
    after = client.get(f"/billing/invoices/{iid}", headers=h).json()
    assert after["invoice"]["status"] == "paid"


def test_payment_partial_marks_partially_paid():
    h = _recept_h()
    pid, _ = _patient_with_visit()
    inv = client.post("/billing/invoices", headers=h, json={
        "patient_id": pid,
        "line_items": [{"description": "x", "unit_amount": 100}],
    }).json()
    iid = inv["id"]
    with _db_conn() as conn:
        conn.execute("UPDATE invoices SET status = 'unpaid' WHERE id = ?", [iid])
    client.post(
        f"/billing/invoices/{iid}/payments", headers=h,
        json={"amount": 40.0, "method": "card"},
    )
    after = client.get(f"/billing/invoices/{iid}", headers=h).json()
    assert after["invoice"]["status"] == "partially_paid"


def test_payment_multiple_partials_accumulate():
    h = _recept_h()
    pid, _ = _patient_with_visit()
    inv = client.post("/billing/invoices", headers=h, json={
        "patient_id": pid,
        "line_items": [{"description": "x", "unit_amount": 100}],
    }).json()
    iid = inv["id"]
    with _db_conn() as conn:
        conn.execute("UPDATE invoices SET status = 'unpaid' WHERE id = ?", [iid])
    client.post(f"/billing/invoices/{iid}/payments", headers=h, json={"amount": 30, "method": "cash"})
    client.post(f"/billing/invoices/{iid}/payments", headers=h, json={"amount": 30, "method": "cash"})
    client.post(f"/billing/invoices/{iid}/payments", headers=h, json={"amount": 40, "method": "cash"})
    after = client.get(f"/billing/invoices/{iid}", headers=h).json()
    assert after["invoice"]["status"] == "paid"
    assert after["invoice"]["amount_paid"] == 100.0


def test_admin_can_void_invoice():
    h_admin = _admin_h()
    h_r = _recept_h()
    pid, _ = _patient_with_visit()
    inv = client.post("/billing/invoices", headers=h_r, json={
        "patient_id": pid,
        "line_items": [{"description": "x", "unit_amount": 100}],
    }).json()
    iid = inv["id"]
    r = client.post(f"/billing/invoices/{iid}/void", headers=h_admin)
    assert r.status_code == 200
    assert r.json()["status"] == "void"


def test_receptionist_cannot_void_invoice():
    h_r = _recept_h()
    pid, _ = _patient_with_visit()
    inv = client.post("/billing/invoices", headers=h_r, json={
        "patient_id": pid,
        "line_items": [{"description": "x", "unit_amount": 100}],
    }).json()
    iid = inv["id"]
    r = client.post(f"/billing/invoices/{iid}/void", headers=h_r)
    assert r.status_code == 403


def test_claim_create_and_submit_and_deny():
    h_r = _recept_h()
    pid, _ = _patient_with_visit()
    inv = client.post("/billing/invoices", headers=h_r, json={
        "patient_id": pid,
        "line_items": [{"description": "x", "unit_amount": 100}],
    }).json()
    iid = inv["id"]
    cr = client.post(
        f"/billing/invoices/{iid}/claim", headers=h_r,
        json={"payer_name": "Acme", "claim_number": "CLM-001"},
    )
    assert cr.status_code == 201, cr.text
    cid = cr.json()["id"]
    assert cr.json()["status"] == "draft"
    # Submit
    sr = client.patch(
        f"/billing/claims/{cid}", headers=h_r, json={"status": "submitted"},
    )
    assert sr.status_code == 200
    # Move to in_review first (otherwise approve/deny would 409 from draft)
    client.patch(f"/billing/claims/{cid}", headers=h_r, json={"status": "in_review"})
    # Deny with reason + appeal_deadline
    appeal = (datetime.now(UTC) + timedelta(days=30)).date().isoformat()
    dr = client.patch(
        f"/billing/claims/{cid}", headers=h_r,
        json={"status": "denied", "denial_reason": "Out of network", "appeal_deadline": appeal},
    )
    assert dr.status_code == 200, dr.text
    after = client.get(f"/billing/claims/{cid}", headers=h_r).json()
    assert after["status"] == "denied"
    assert after["denial_reason"] == "Out of network"


def test_deny_without_reason_is_400():
    h_r = _recept_h()
    pid, _ = _patient_with_visit()
    inv = client.post("/billing/invoices", headers=h_r, json={
        "patient_id": pid,
        "line_items": [{"description": "x", "unit_amount": 50}],
    }).json()
    iid = inv["id"]
    cr = client.post(f"/billing/invoices/{iid}/claim", headers=h_r, json={"payer_name": "X"}).json()
    cid = cr["id"]
    client.patch(f"/billing/claims/{cid}", headers=h_r, json={"status": "submitted"})
    client.patch(f"/billing/claims/{cid}", headers=h_r, json={"status": "in_review"})
    r = client.patch(f"/billing/claims/{cid}", headers=h_r, json={"status": "denied"})
    assert r.status_code == 400


def test_appeal_due_before_filter_returns_due_claims():
    h_r = _recept_h()
    pid, _ = _patient_with_visit()
    inv = client.post("/billing/invoices", headers=h_r, json={
        "patient_id": pid,
        "line_items": [{"description": "x", "unit_amount": 50}],
    }).json()
    iid = inv["id"]
    cr = client.post(f"/billing/invoices/{iid}/claim", headers=h_r, json={"payer_name": "X"}).json()
    cid = cr["id"]
    client.patch(f"/billing/claims/{cid}", headers=h_r, json={"status": "submitted"})
    client.patch(f"/billing/claims/{cid}", headers=h_r, json={"status": "in_review"})
    # Deny with appeal_deadline 5 days from now
    soon = (datetime.now(UTC) + timedelta(days=5)).date().isoformat()
    client.patch(
        f"/billing/claims/{cid}", headers=h_r,
        json={"status": "denied", "denial_reason": "x", "appeal_deadline": soon},
    )
    # Filter for appeals due before 10 days from now
    cutoff = (datetime.now(UTC) + timedelta(days=10)).date().isoformat()
    r = client.get(
        f"/billing/claims?appeal_due_before={cutoff}", headers=h_r,
    )
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()["claims"]]
    assert cid in ids


def test_rbac_doctor_denied_403():
    h_d = _doctor_h()
    r = client.get("/billing/invoices", headers=h_d)
    assert r.status_code == 403


def test_payment_refuses_draft_invoice():
    h_r = _recept_h()
    pid, _ = _patient_with_visit()
    inv = client.post("/billing/invoices", headers=h_r, json={
        "patient_id": pid,
        "line_items": [{"description": "x", "unit_amount": 50}],
    }).json()
    iid = inv["id"]
    r = client.post(
        f"/billing/invoices/{iid}/payments", headers=h_r,
        json={"amount": 50, "method": "cash"},
    )
    assert r.status_code == 409