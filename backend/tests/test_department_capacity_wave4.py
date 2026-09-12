"""Ticket #44 — department capacity & bed occupancy.

Derived occupancy, the capacity read/patch endpoints, the over-capacity
warning list, and the bed-capacity floor guard.
"""

from __future__ import annotations

import uuid

from test_auth import _db_conn, bearer, client, login

ADMIN = ("admin@hospital.test", "Hospital2025!")
DOCTOR = ("doctor@hospital.test", "Hospital2025!")
NURSE = ("nurse@hospital.test", "Hospital2025!")
RECEPTIONIST = ("receptionist@hospital.test", "Hospital2025!")


def _headers(creds):
    return bearer(login(*creds)["access_token"])


def _dept(code="GEN"):
    with _db_conn() as conn:
        row = conn.execute(
            "SELECT id, bed_capacity, min_clinicians_per_shift FROM departments WHERE code = ?",
            (code,),
        ).fetchone()
    return row


def _create_patient(dept_id, admission_status="outpatient"):
    unique = uuid.uuid4().hex[:8]
    r = client.post(
        "/patients",
        headers=_headers(ADMIN),
        json={
            "full_name": f"Capacity {unique}",
            "dob": "1990-05-05",
            "phone": f"0815{uuid.uuid4().int & 0xFFFFFF:06d}",
            "national_id": f"55{uuid.uuid4().int & 0xFFFFFFFFFFFF:012d}",
            "admission_status": admission_status,
            "primary_department_id": dept_id,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _admit(pid):
    r = client.patch(
        f"/patients/{pid}", headers=_headers(ADMIN), json={"admission_status": "admitted"}
    )
    assert r.status_code == 200, r.text
    return r.json()


def _occupancy(pid, dept_id):
    """Admitted patients currently in the department (excluding `pid`)."""
    with _db_conn() as conn:
        return conn.execute(
            "SELECT COUNT(*) FROM patients WHERE primary_department_id = ? "
            "AND admission_status = 'admitted' AND id != ?",
            (dept_id, pid),
        ).fetchone()[0]


# ---- Capacity read ---------------------------------------------------------


def test_capacity_payload_shape_and_pressure():
    dept = _dept()
    pid = _create_patient(dept["id"])
    _admit(pid)
    r = client.get(f"/admin/departments/{dept['id']}/capacity", headers=_headers(ADMIN))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["bed_capacity"] == dept["bed_capacity"]
    assert body["min_clinicians_per_shift"] == dept["min_clinicians_per_shift"]
    assert body["occupied_beds"] == _occupancy(pid, dept["id"]) + 1
    assert body["available_beds"] == max(0, body["bed_capacity"] - body["occupied_beds"])
    assert body["assigned_staff_count"] >= 0
    assert isinstance(body["pressure"], float)


def test_capacity_zero_bed_department_reports_zero_pressure():
    dept = _dept("NEU")  # seeded with zero admitted patients
    patch = client.patch(
        f"/admin/departments/{dept['id']}/capacity",
        headers=_headers(ADMIN),
        json={"bed_capacity": 0},
    )
    assert patch.status_code == 200, patch.text
    r = client.get(f"/admin/departments/{dept['id']}/capacity", headers=_headers(ADMIN))
    assert r.status_code == 200
    assert r.json()["bed_capacity"] == 0
    assert r.json()["pressure"] == 0.0


def test_capacity_read_roles():
    dept = _dept()
    assert client.get(
        f"/admin/departments/{dept['id']}/capacity", headers=_headers(DOCTOR)
    ).status_code == 200
    assert client.get(
        f"/admin/departments/{dept['id']}/capacity", headers=_headers(NURSE)
    ).status_code == 200
    assert client.get(
        f"/admin/departments/{dept['id']}/capacity", headers=_headers(RECEPTIONIST)
    ).status_code == 403


# ---- Capacity patch --------------------------------------------------------


def test_patch_capacity_above_occupancy_succeeds():
    dept = _dept()
    r = client.patch(
        f"/admin/departments/{dept['id']}/capacity",
        headers=_headers(ADMIN),
        json={"bed_capacity": dept["bed_capacity"] + 10,
              "min_clinicians_per_shift": dept["min_clinicians_per_shift"] + 1},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["bed_capacity"] == dept["bed_capacity"] + 10
    assert body["min_clinicians_per_shift"] == dept["min_clinicians_per_shift"] + 1


def test_patch_capacity_below_occupancy_is_409():
    dept = _dept()
    pid = _create_patient(dept["id"])
    _admit(pid)
    r = client.patch(
        f"/admin/departments/{dept['id']}/capacity",
        headers=_headers(ADMIN),
        json={"bed_capacity": 0},
    )
    assert r.status_code == 409, r.text
    assert "occupancy" in r.json()["error"]["message"]


def test_patch_capacity_non_admin_is_403():
    dept = _dept()
    r = client.patch(
        f"/admin/departments/{dept['id']}/capacity",
        headers=_headers(DOCTOR),
        json={"min_clinicians_per_shift": 3},
    )
    assert r.status_code == 403


def test_patch_capacity_unknown_department_is_404():
    r = client.patch(
        "/admin/departments/999999/capacity",
        headers=_headers(ADMIN),
        json={"min_clinicians_per_shift": 2},
    )
    assert r.status_code == 404


# ---- Occupancy derivation --------------------------------------------------


def test_admitting_patient_increments_occupancy_on_next_read():
    dept = _dept()
    before = client.get(
        f"/admin/departments/{dept['id']}/capacity", headers=_headers(ADMIN)
    ).json()["occupied_beds"]
    pid = _create_patient(dept["id"])
    _admit(pid)
    after = client.get(
        f"/admin/departments/{dept['id']}/capacity", headers=_headers(ADMIN)
    ).json()["occupied_beds"]
    assert after == before + 1


def test_list_departments_returns_occupancy_metrics():
    r = client.get("/admin/departments", headers=_headers(ADMIN))
    assert r.status_code == 200
    departments = r.json()["departments"]
    assert departments
    for dept in departments:
        assert "occupied_beds" in dept
        assert "total_beds" in dept
        assert "occupancy_pct" in dept


# ---- Over-capacity ---------------------------------------------------------


def test_over_capacity_flags_departments_above_threshold():
    dept = _dept("GEN")
    patch = client.patch(
        f"/admin/departments/{dept['id']}/capacity",
        headers=_headers(ADMIN),
        json={"bed_capacity": 1},
    )
    assert patch.status_code == 200, patch.text
    pid = _create_patient(dept["id"])
    _admit(pid)
    r = client.get(
        "/admin/departments/over-capacity",
        params={"threshold": 0.9},
        headers=_headers(ADMIN),
    )
    assert r.status_code == 200, r.text
    flagged = [d["department"]["id"] for d in r.json()["departments"]]
    assert dept["id"] in flagged


def test_over_capacity_ignores_zero_capacity():
    dept = _dept("NEU")
    assert client.patch(
        f"/admin/departments/{dept['id']}/capacity",
        headers=_headers(ADMIN),
        json={"bed_capacity": 0},
    ).status_code == 200
    r = client.get(
        "/admin/departments/over-capacity",
        params={"threshold": 0.0},
        headers=_headers(ADMIN),
    )
    assert r.status_code == 200
    flagged = [d["department"]["id"] for d in r.json()["departments"]]
    assert dept["id"] not in flagged


def test_over_capacity_requires_admin():
    r = client.get("/admin/departments/over-capacity", headers=_headers(NURSE))
    assert r.status_code == 403