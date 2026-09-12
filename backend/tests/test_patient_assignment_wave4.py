"""Ticket #45 — nurse-patient shift assignment.

Assignment create with overlap rejection, the "my patients this shift"
worklist, and soft-delete cancellation that preserves the audit trail.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from test_auth import _db_conn, bearer, client, login

ADMIN = ("admin@hospital.test", "Hospital2025!")
NURSE = ("nurse@hospital.test", "Hospital2025!")


def _headers(creds):
    return bearer(login(*creds)["access_token"])


def _today():
    return datetime.now(UTC).date().isoformat()


def _shift_iso(hour):
    return f"{_today()}T{hour:02d}:00:00Z"


def _nurse_id():
    with _db_conn() as conn:
        return conn.execute(
            "SELECT id FROM users WHERE email = ?", (NURSE[0],)
        ).fetchone()[0]


def _make_patient():
    unique = uuid.uuid4().hex[:8]
    r = client.post(
        "/patients",
        headers=_headers(ADMIN),
        json={
            "full_name": f"Shift {unique}",
            "dob": "1988-11-11",
            "phone": f"0816{uuid.uuid4().int & 0xFFFFFF:06d}",
            "national_id": f"44{uuid.uuid4().int & 0xFFFFFFFFFFFF:012d}",
            "acuity": "urgent",
            "admission_status": "admitted",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _create_assignment(pid, user_id, start_hour=0, end_hour=12, role="nurse"):
    return client.post(
        "/admin/patient-assignments",
        headers=_headers(ADMIN),
        json={
            "patient_id": pid,
            "user_id": user_id,
            "role": role,
            "shift_start": _shift_iso(start_hour),
            "shift_end": _shift_iso(end_hour),
            "bed_label": "B-101",
        },
    )


# ---- Assignment management -------------------------------------------------


def test_create_assignment_returns_active_row():
    pid = _make_patient()
    nurse_id = _nurse_id()
    r = _create_assignment(pid, nurse_id)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["patient_id"] == pid
    assert body["user_id"] == nurse_id
    assert body["role"] == "nurse"
    assert body["status"] == "active"
    assert body["bed_label"] == "B-101"


def test_create_overlapping_assignment_is_409():
    pid = _make_patient()
    nurse_id = _nurse_id()
    assert _create_assignment(pid, nurse_id, 0, 12).status_code == 201
    r = _create_assignment(pid, nurse_id, 8, 16)
    assert r.status_code == 409, r.text
    err = r.json().get("error", r.json())
    assert err.get("code") in ("http_409", "assignment_overlap")
    assert "assignment" in r.json()["error"]["message"].lower()


def test_create_non_overlapping_assignment_same_day_is_201():
    pid = _make_patient()
    nurse_id = _nurse_id()
    assert _create_assignment(pid, nurse_id, 0, 12).status_code == 201
    r = _create_assignment(pid, nurse_id, 13, 23)
    assert r.status_code == 201, r.text


def test_create_assignment_to_non_nurse_is_422():
    pid = _make_patient()
    with _db_conn() as conn:
        doctor_id = conn.execute(
            "SELECT id FROM users WHERE email = ?", ("doctor@hospital.test",)
        ).fetchone()[0]
    r = _create_assignment(pid, doctor_id)
    assert r.status_code == 422


def test_create_assignment_unknown_patient_is_404():
    r = _create_assignment(999999, _nurse_id())
    assert r.status_code == 404


def test_create_assignment_unknown_user_is_404():
    r = _create_assignment(_make_patient(), 999999)
    assert r.status_code == 404


def test_create_assignment_end_before_start_is_422():
    pid = _make_patient()
    r = _create_assignment(pid, _nurse_id(), 12, 8)
    assert r.status_code == 422


def test_create_assignment_requires_admin():
    pid = _make_patient()
    r = _create_assignment(pid, _nurse_id())
    r = client.post(
        "/admin/patient-assignments",
        headers=_headers(NURSE),
        json={
            "patient_id": pid,
            "user_id": _nurse_id(),
            "shift_start": _shift_iso(0),
            "shift_end": _shift_iso(12),
        },
    )
    assert r.status_code == 403


# ---- Nurse worklist --------------------------------------------------------


def test_my_patients_returns_enriched_worklist():
    pid = _make_patient()
    client.post(
        f"/patients/{pid}/allergies",
        headers=_headers(ADMIN),
        json={"allergen": "Latex", "severity": "moderate"},
    )
    nurse_id = _nurse_id()
    assert _create_assignment(pid, nurse_id, 0, 12).status_code == 201
    r = client.get(
        f"/admin/users/{nurse_id}/my-patients",
        params={"shift_date": _today()},
        headers=_headers(NURSE),
    )
    assert r.status_code == 200, r.text
    patients = r.json()["patients"]
    assert any(p["patient_id"] == pid for p in patients)
    patient = next(p for p in patients if p["patient_id"] == pid)
    assert patient["mrn"]
    assert patient["acuity"] == "urgent"
    assert patient["bed_label"] == "B-101"
    assert any(a["allergen"] == "Latex" for a in patient["allergies"])
    assert isinstance(patient["vitals_due"], bool)


def test_my_patients_nurse_cannot_read_another_nurse():
    other = client.post(
        "/admin/users",
        headers=_headers(ADMIN),
        json={
            "email": f"other.nurse{uuid.uuid4().hex[:6]}@example.com",
            "password": "Hospital2025!",
            "full_name": "Other Nurse",
            "role": "nurse",
        },
    )
    assert other.status_code == 201, other.text
    other_id = other.json()["id"]
    r = client.get(
        f"/admin/users/{other_id}/my-patients",
        params={"shift_date": _today()},
        headers=_headers(NURSE),
    )
    assert r.status_code == 403


def test_my_patients_admin_reads_any_user():
    nurse_id = _nurse_id()
    r = client.get(
        f"/admin/users/{nurse_id}/my-patients",
        params={"shift_date": _today()},
        headers=_headers(ADMIN),
    )
    assert r.status_code == 200


def test_my_patients_no_assignments_returns_empty():
    nurse_id = _nurse_id()
    r = client.get(
        f"/admin/users/{nurse_id}/my-patients",
        params={"shift_date": _today()},
        headers=_headers(NURSE),
    )
    assert r.status_code == 200
    assert r.json()["patients"] == []


def test_my_patients_ignores_cancelled_assignments():
    pid = _make_patient()
    nurse_id = _nurse_id()
    assignment = _create_assignment(pid, nurse_id, 0, 12)
    assert assignment.status_code == 201
    assignment_id = assignment.json()["id"]
    assert client.delete(
        f"/admin/patient-assignments/{assignment_id}", headers=_headers(ADMIN)
    ).status_code == 204
    r = client.get(
        f"/admin/users/{nurse_id}/my-patients",
        params={"shift_date": _today()},
        headers=_headers(NURSE),
    )
    assert r.json()["patients"] == []


# ---- Cancellation ----------------------------------------------------------


def test_delete_assignment_soft_cancels():
    pid = _make_patient()
    assignment = _create_assignment(pid, _nurse_id(), 0, 12)
    assignment_id = assignment.json()["id"]
    r = client.delete(
        f"/admin/patient-assignments/{assignment_id}", headers=_headers(ADMIN)
    )
    assert r.status_code == 204
    with _db_conn() as conn:
        row = conn.execute(
            "SELECT status FROM patient_assignments WHERE id = ?", (assignment_id,)
        ).fetchone()
    assert row["status"] == "cancelled"


def test_delete_missing_assignment_is_404():
    r = client.delete("/admin/patient-assignments/999999", headers=_headers(ADMIN))
    assert r.status_code == 404


# ---- Audit -----------------------------------------------------------------


def test_assignment_actions_write_audit_rows():
    pid = _make_patient()
    assignment = _create_assignment(pid, _nurse_id(), 0, 12)
    assignment_id = assignment.json()["id"]
    client.delete(f"/admin/patient-assignments/{assignment_id}", headers=_headers(ADMIN))
    with _db_conn() as conn:
        actions = [
            r["action"]
            for r in conn.execute(
                "SELECT action FROM audit_log WHERE entity_type = 'patient_assignment' "
                "AND entity_id = ?",
                (str(assignment_id),),
            )
        ]
    assert "patient_assignment.create" in actions
    assert "patient_assignment.cancel" in actions