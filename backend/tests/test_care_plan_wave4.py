"""Ticket #42 — care plan items & shift handover.

Item lifecycle (create/list/patch/complete/reassign) and the per-shift
handover bundle built from the nurse's patient assignments.
"""

from __future__ import annotations

import time
import uuid
from datetime import UTC, datetime, timedelta

from test_auth import _db_conn, bearer, client, login

ADMIN = ("admin@hospital.test", "Hospital2025!")
DOCTOR = ("doctor@hospital.test", "Hospital2025!")
NURSE = ("nurse@hospital.test", "Hospital2025!")


def _headers(creds):
    return bearer(login(*creds)["access_token"])


def _make_patient():
    unique = uuid.uuid4().hex[:8]
    r = client.post(
        "/patients",
        headers=_headers(ADMIN),
        json={
            "full_name": f"CarePlan {unique}",
            "dob": "1982-02-20",
            "phone": f"0814{uuid.uuid4().int & 0xFFFFFF:06d}",
            "national_id": f"66{uuid.uuid4().int & 0xFFFFFFFFFFFF:012d}",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _future_ts(hours=2):
    return int((datetime.now(UTC) + timedelta(hours=hours)).timestamp())


def _nurse_id():
    with _db_conn() as conn:
        return conn.execute(
            "SELECT id FROM users WHERE email = ?", (NURSE[0],)
        ).fetchone()[0]


def _assign(pid, user_id, shift_date):
    from app.services.patient_assignment import insert_assignment

    with _db_conn() as conn:
        start = int(datetime.fromisoformat(f"{shift_date}T00:00:00+00:00").timestamp())
        return insert_assignment(
            conn, patient_id=pid, user_id=user_id, role="nurse",
            shift_start=start, shift_end=start + 12 * 3600, created_by=user_id,
        )


# ---- Item lifecycle --------------------------------------------------------


def test_create_care_plan_item_returns_priority_and_due_at():
    pid = _make_patient()
    due = _future_ts()
    due_iso = datetime.fromtimestamp(due, UTC).isoformat()
    r = client.post(
        f"/medical-records/patients/{pid}/care-plan",
        headers=_headers(DOCTOR),
        json={"description": "Dressing change", "priority": "high", "due_at": due_iso},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["priority"] == "high"
    assert body["completed"] in (0, False)
    assert body["description"] == "Dressing change"


def test_create_care_plan_requires_description_and_priority():
    pid = _make_patient()
    r = client.post(
        f"/medical-records/patients/{pid}/care-plan",
        headers=_headers(DOCTOR),
        json={"description": "no priority"},
    )
    assert r.status_code == 422


def test_create_care_plan_past_due_is_422():
    pid = _make_patient()
    past = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    r = client.post(
        f"/medical-records/patients/{pid}/care-plan",
        headers=_headers(DOCTOR),
        json={"description": "too late", "priority": "normal", "due_at": past},
    )
    assert r.status_code == 422


def test_create_care_plan_invalid_priority_is_422():
    pid = _make_patient()
    r = client.post(
        f"/medical-records/patients/{pid}/care-plan",
        headers=_headers(DOCTOR),
        json={"description": "bad priority", "priority": "emergent"},
    )
    assert r.status_code == 422


def test_list_care_plan_sorts_by_priority_then_due():
    pid = _make_patient()
    client.post(
        f"/medical-records/patients/{pid}/care-plan",
        headers=_headers(DOCTOR),
        json={"description": "normal item", "priority": "normal"},
    )
    client.post(
        f"/medical-records/patients/{pid}/care-plan",
        headers=_headers(DOCTOR),
        json={"description": "high item", "priority": "high"},
    )
    client.post(
        f"/medical-records/patients/{pid}/care-plan",
        headers=_headers(DOCTOR),
        json={"description": "low item", "priority": "low"},
    )
    r = client.get(
        f"/medical-records/patients/{pid}/care-plan", headers=_headers(NURSE)
    )
    assert r.status_code == 200
    order = [item["description"] for item in r.json()["items"]]
    assert order == ["high item", "normal item", "low item"]


def test_list_care_plan_excludes_completed():
    pid = _make_patient()
    created = client.post(
        f"/medical-records/patients/{pid}/care-plan",
        headers=_headers(DOCTOR),
        json={"description": "will complete", "priority": "high"},
    ).json()
    client.post(
        f"/medical-records/care-plan/{created['id']}/complete",
        headers=_headers(NURSE),
    )
    r = client.get(f"/medical-records/patients/{pid}/care-plan", headers=_headers(NURSE))
    assert r.json()["items"] == []


def test_patch_updates_description_and_priority():
    pid = _make_patient()
    item = client.post(
        f"/medical-records/patients/{pid}/care-plan",
        headers=_headers(DOCTOR),
        json={"description": "original", "priority": "normal"},
    ).json()
    r = client.patch(
        f"/medical-records/care-plan/{item['id']}",
        headers=_headers(NURSE),
        json={"description": "updated", "priority": "urgent"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["description"] == "updated"
    assert r.json()["priority"] == "urgent"


def test_patch_complete_stamps_who_and_when():
    pid = _make_patient()
    item = client.post(
        f"/medical-records/patients/{pid}/care-plan",
        headers=_headers(DOCTOR),
        json={"description": "complete me", "priority": "high"},
    ).json()
    r = client.patch(
        f"/medical-records/care-plan/{item['id']}",
        headers=_headers(NURSE),
        json={"completed": True},
    )
    assert r.status_code == 200
    assert r.json()["completed"] in (1, True)
    assert r.json()["completed_by"] is not None
    assert r.json()["completed_at"] is not None


def test_complete_endpoint_then_reopen_via_patch():
    pid = _make_patient()
    item = client.post(
        f"/medical-records/patients/{pid}/care-plan",
        headers=_headers(DOCTOR),
        json={"description": "toggle me", "priority": "low"},
    ).json()
    complete = client.post(
        f"/medical-records/care-plan/{item['id']}/complete",
        headers=_headers(NURSE),
    )
    assert complete.status_code == 200
    assert complete.json()["completed_at"] is not None
    # Reopening clears the completion stamp so it reads as open again.
    reopened = client.patch(
        f"/medical-records/care-plan/{item['id']}",
        headers=_headers(NURSE),
        json={"completed": False},
    )
    assert reopened.status_code == 200
    assert reopened.json()["completed"] in (0, False)
    assert reopened.json()["completed_at"] is None


def test_complete_twice_is_409():
    pid = _make_patient()
    item = client.post(
        f"/medical-records/patients/{pid}/care-plan",
        headers=_headers(DOCTOR),
        json={"description": "double", "priority": "normal"},
    ).json()
    assert client.post(
        f"/medical-records/care-plan/{item['id']}/complete", headers=_headers(NURSE)
    ).status_code == 200
    r = client.post(
        f"/medical-records/care-plan/{item['id']}/complete", headers=_headers(NURSE)
    )
    assert r.status_code == 409


def test_reassign_item_to_another_nurse():
    pid = _make_patient()
    item = client.post(
        f"/medical-records/patients/{pid}/care-plan",
        headers=_headers(DOCTOR),
        json={"description": "move me", "priority": "normal"},
    ).json()
    r = client.post(
        f"/medical-records/care-plan/{item['id']}/reassign",
        headers=_headers(ADMIN),
        json={"assigned_to": _nurse_id()},
    )
    assert r.status_code == 200, r.text
    assert r.json()["assigned_to"] == _nurse_id()


def test_reassign_to_non_nurse_is_422():
    pid = _make_patient()
    item = client.post(
        f"/medical-records/patients/{pid}/care-plan",
        headers=_headers(DOCTOR),
        json={"description": "no move", "priority": "normal"},
    ).json()
    with _db_conn() as conn:
        doctor_id = conn.execute(
            "SELECT id FROM users WHERE email = ?", (DOCTOR[0],)
        ).fetchone()[0]
    r = client.post(
        f"/medical-records/care-plan/{item['id']}/reassign",
        headers=_headers(ADMIN),
        json={"assigned_to": doctor_id},
    )
    assert r.status_code == 422


# ---- Shift handover --------------------------------------------------------


def test_shift_handover_returns_patients_with_open_items():
    pid = _make_patient()
    item = client.post(
        f"/medical-records/patients/{pid}/care-plan",
        headers=_headers(DOCTOR),
        json={"description": "handover item", "priority": "high"},
    ).json()
    nurse_id = _nurse_id()
    shift_date = datetime.now(UTC).date().isoformat()
    _assign(pid, nurse_id, shift_date)
    r = client.get(
        "/medical-records/care-plan/shift-handover",
        params={"from_user_id": nurse_id, "to_user_id": nurse_id, "shift_date": shift_date},
        headers=_headers(NURSE),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["shift_date"] == shift_date
    assert any(p["id"] == pid for p in body["patients"])
    patient = next(p for p in body["patients"] if p["id"] == pid)
    assert patient["open_item_count"] >= 1
    assert any(i["id"] == item["id"] for i in patient["open_items"])


def test_shift_handover_nurse_cannot_read_another_shift():
    pid = _make_patient()
    with _db_conn() as conn:
        doctor_id = conn.execute(
            "SELECT id FROM users WHERE email = ?", (DOCTOR[0],)
        ).fetchone()[0]
    shift_date = datetime.now(UTC).date().isoformat()
    _assign(pid, doctor_id, shift_date)
    r = client.get(
        "/medical-records/care-plan/shift-handover",
        params={"from_user_id": doctor_id, "shift_date": shift_date},
        headers=_headers(NURSE),
    )
    assert r.status_code == 403


def test_shift_handover_no_assignments_returns_empty():
    nurse_id = _nurse_id()
    shift_date = (datetime.now(UTC).date() + timedelta(days=30)).isoformat()
    r = client.get(
        "/medical-records/care-plan/shift-handover",
        params={"from_user_id": nurse_id, "shift_date": shift_date},
        headers=_headers(NURSE),
    )
    assert r.status_code == 200
    assert r.json()["patients"] == []


def test_shift_handover_invalid_date_is_422():
    r = client.get(
        "/medical-records/care-plan/shift-handover",
        params={"from_user_id": _nurse_id(), "shift_date": "not-a-date"},
        headers=_headers(NURSE),
    )
    assert r.status_code == 422