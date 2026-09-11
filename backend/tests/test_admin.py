"""Tests for the admin domain (ticket #23).

User CRUD, department CRUD, role assignment, department-staff mapping.
"""
from __future__ import annotations

import uuid

import pytest

from test_auth import _db_conn, bearer, client, login

ADMIN = ("admin@hospital.test", "Hospital2025!")
DOCTOR = ("doctor@hospital.test", "Hospital2025!")


def _admin_h():
    return bearer(login(*ADMIN)["access_token"])


def _doctor_h():
    return bearer(login(*DOCTOR)["access_token"])


def _unique_email() -> str:
    return f"test-{uuid.uuid4().hex[:8]}@example.com"


def test_admin_creates_user_201():
    h = _admin_h()
    r = client.post(
        "/admin/users", headers=h,
        json={
            "email": _unique_email(),
            "password": "Hospital2025!",
            "full_name": "Test User",
            "role": "doctor",
            "department_id": 1,
            "specialisation": "cardiology",
        },
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["email"]
    assert data["role"] == "doctor"
    assert data["is_active"]  # 1/True from SQLite


def test_admin_creates_user_duplicate_email_409():
    h = _admin_h()
    email = _unique_email()
    body = {
        "email": email,
        "password": "Hospital2025!",
        "full_name": "Dup",
        "role": "nurse",
    }
    r1 = client.post("/admin/users", headers=h, json=body)
    assert r1.status_code == 201
    r2 = client.post("/admin/users", headers=h, json=body)
    assert r2.status_code == 409


def test_admin_patches_user_role():
    h = _admin_h()
    r = client.post(
        "/admin/users", headers=h,
        json={"email": _unique_email(), "password": "Hospital2025!",
              "full_name": "X", "role": "nurse"},
    )
    uid = r.json()["id"]
    p = client.patch(f"/admin/users/{uid}", headers=h, json={"role": "doctor"})
    assert p.status_code == 200, p.text
    assert p.json()["role"] == "doctor"


def test_doctor_cannot_list_users_403():
    h = _doctor_h()
    r = client.get("/admin/users", headers=h)
    assert r.status_code == 403


def test_admin_deactivates_user_204():
    h = _admin_h()
    r = client.post(
        "/admin/users", headers=h,
        json={"email": _unique_email(), "password": "Hospital2025!",
              "full_name": "To Deact", "role": "nurse"},
    )
    uid = r.json()["id"]
    d = client.post(f"/admin/users/{uid}/deactivate", headers=h)
    assert d.status_code == 204
    g = client.get(f"/admin/users/{uid}", headers=h)
    assert not g.json()["is_active"]  # 0/False from SQLite


def test_admin_creates_department_201():
    h = _admin_h()
    code = f"D{uuid.uuid4().hex[:4].upper()}"
    r = client.post(
        "/admin/departments", headers=h,
        json={"name": "Cardiology", "code": code, "type": "specialty",
              "bed_capacity": 30, "min_clinicians_per_shift": 3},
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["code"] == code
    assert data["bed_capacity"] == 30


def test_admin_creates_department_duplicate_code_409():
    h = _admin_h()
    code = f"D{uuid.uuid4().hex[:4].upper()}"
    body = {"name": "X", "code": code, "type": "general"}
    r1 = client.post("/admin/departments", headers=h, json=body)
    assert r1.status_code == 201
    r2 = client.post("/admin/departments", headers=h, json=body)
    assert r2.status_code == 409


def test_patches_department_capacity():
    h = _admin_h()
    code = f"D{uuid.uuid4().hex[:4].upper()}"
    r = client.post("/admin/departments", headers=h,
                    json={"name": "X", "code": code, "type": "general"})
    did = r.json()["id"]
    p = client.patch(f"/admin/departments/{did}", headers=h,
                     json={"bed_capacity": 99, "active": False})
    assert p.status_code == 200
    assert p.json()["bed_capacity"] == 99
    assert not p.json()["active"]  # may be 0/False from SQLite


def test_assigns_staff_to_department():
    h = _admin_h()
    # Create a fresh doctor
    ur = client.post(
        "/admin/users", headers=h,
        json={"email": _unique_email(), "password": "Hospital2025!",
              "full_name": "New Doc", "role": "doctor"},
    )
    uid = ur.json()["id"]
    # Create a fresh department
    code = f"D{uuid.uuid4().hex[:4].upper()}"
    dr = client.post("/admin/departments", headers=h,
                     json={"name": "Y", "code": code, "type": "general"})
    did = dr.json()["id"]
    # Assign
    ar = client.post(
        "/admin/department-staff", headers=h,
        json={"user_id": uid, "department_id": did},
    )
    assert ar.status_code == 201, ar.text
    aid = ar.json()["id"]
    # Duplicate assignment
    ar2 = client.post(
        "/admin/department-staff", headers=h,
        json={"user_id": uid, "department_id": did},
    )
    assert ar2.status_code == 409
    # Unassign
    dr2 = client.delete(f"/admin/department-staff/{aid}", headers=h)
    assert dr2.status_code == 204


def test_doctor_can_list_departments():
    h = _doctor_h()
    r = client.get("/admin/departments", headers=h)
    assert r.status_code == 200
    assert isinstance(r.json()["departments"], list)


def test_doctor_cannot_create_department_403():
    h = _doctor_h()
    r = client.post(
        "/admin/departments", headers=h,
        json={"name": "Z", "code": f"DZ{uuid.uuid4().hex[:3].upper()}", "type": "general"},
    )
    assert r.status_code == 403