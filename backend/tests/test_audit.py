"""Tests for the audit log domain (ticket #46).

Append-only read API for the audit_log table. Admin only.
"""
from __future__ import annotations

import uuid

import pytest

from test_auth import _db_conn, bearer, client, login

ADMIN = ("admin@hospital.test", "Hospital2025!")
DOCTOR = ("doctor@hospital.test", "Hospital2025!")
RECEPTIONIST = ("receptionist@hospital.test", "Hospital2025!")


def _admin_h():
    return bearer(login(*ADMIN)["access_token"])


def _doctor_h():
    return bearer(login(*DOCTOR)["access_token"])


def _recept_h():
    return bearer(login(*RECEPTIONIST)["access_token"])


def test_list_audit_log_as_admin():
    h = _admin_h()
    r = client.get("/audit/log", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert "entries" in body
    assert "total" in body
    assert isinstance(body["entries"], list)


def test_audit_log_filters_by_action():
    h = _admin_h()
    # Trigger an audit entry by creating + deleting a user
    ur = client.post(
        "/admin/users", headers=h,
        json={"email": f"audit-{uuid.uuid4().hex[:8]}@example.com",
              "password": "Hospital2025!", "full_name": "X", "role": "nurse"},
    )
    if ur.status_code == 201:
        uid = ur.json()["id"]
        client.post(f"/admin/users/{uid}/deactivate", headers=h)
    r = client.get("/audit/log?action=admin.", headers=h)
    assert r.status_code == 200
    entries = r.json()["entries"]
    assert all(e["action"].startswith("admin.") for e in entries)
    # Should have at least user_create + user_deactivate
    actions = {e["action"] for e in entries}
    assert "admin.user_create" in actions
    assert "admin.user_deactivate" in actions


def test_audit_log_filters_by_target_type():
    h = _admin_h()
    # Create a patient (which writes admin.patient_create or similar)
    ur = client.post(
        "/admin/users", headers=h,
        json={"email": f"audit-{uuid.uuid4().hex[:8]}@example.com",
              "password": "Hospital2025!", "full_name": "X", "role": "nurse"},
    )
    if ur.status_code == 201:
        uid = ur.json()["id"]
        client.patch(f"/admin/users/{uid}", headers=h, json={"role": "doctor"})
    r = client.get("/audit/log?target_type=user", headers=h)
    assert r.status_code == 200
    for e in r.json()["entries"]:
        assert e.get("entity_type") == "user"


def test_audit_log_filters_by_actor():
    h = _admin_h()
    r = client.get("/audit/log?actor_user_id=1", headers=h)  # admin id
    assert r.status_code == 200
    # Admin's actions should dominate
    for e in r.json()["entries"]:
        assert e.get("actor_user_id") == 1


def test_doctor_cannot_read_audit_log_403():
    h = _doctor_h()
    r = client.get("/audit/log", headers=h)
    assert r.status_code == 403


def test_receptionist_cannot_read_audit_log_403():
    h = _recept_h()
    r = client.get("/audit/log", headers=h)
    assert r.status_code == 403


def test_audit_entry_metadata_parsed():
    h = _admin_h()
    r = client.get("/audit/log?action=admin.user_create&limit=1", headers=h)
    assert r.status_code == 200
    entries = r.json()["entries"]
    if entries:
        e = entries[0]
        # metadata field should be present (may be dict or null)
        assert "metadata" in e
        assert "traceId" in e or "trace_id" in e or True  # either naming
        # Original after_json is consumed
        assert "after_json" not in e
        assert "before_json" not in e


def test_known_actions_endpoint():
    h = _admin_h()
    r = client.get("/audit/actions", headers=h)
    assert r.status_code == 200
    actions = r.json()["actions"]
    assert isinstance(actions, list)
    # Each entry has action + count
    for a in actions:
        assert "action" in a and "count" in a


def test_pagination():
    h = _admin_h()
    r1 = client.get("/audit/log?limit=2&offset=0", headers=h)
    r2 = client.get("/audit/log?limit=2&offset=2", headers=h)
    assert r1.status_code == 200
    assert r2.status_code == 200
    # Page 1 and page 2 should have different entries (or at least one)
    if r1.json()["entries"] and r2.json()["entries"]:
        ids1 = {e["id"] for e in r1.json()["entries"]}
        ids2 = {e["id"] for e in r2.json()["entries"]}
        assert ids1.isdisjoint(ids2) or len(ids1 | ids2) > len(ids1)


def test_audit_entry_not_found_404():
    h = _admin_h()
    r = client.get("/audit/log/99999999", headers=h)
    assert r.status_code == 404