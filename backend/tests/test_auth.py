"""Tests for the auth domain (#18): login/logout/me/refresh, RBAC, permission
matrix, admin user management, forgot/reset password.

Uses an isolated SQLite file so it never touches the dev database. The DB is
migrated and seeded before the app is imported; the app's settings resolve to
the same temp file via DATABASE_PATH.
"""

from __future__ import annotations

import os
import pathlib
import sys
import time

import jwt as pyjwt

_SHARED_TEST_DB = pathlib.Path("/tmp/hospital-test-shared.db").resolve()
os.environ["DATABASE_PATH"] = str(_SHARED_TEST_DB)
os.environ["JWT_SECRET"] = "test-secret"

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402
from app.routers import auth as auth_module  # noqa: E402

_db_path = _SHARED_TEST_DB
client = TestClient(app)

ADMIN = ("admin@hospital.test", "Hospital2025!")
DOCTOR = ("doctor@hospital.test", "Hospital2025!")


def login(email: str, password: str) -> dict:
    resp = client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def admin_headers() -> dict:
    return bearer(login(*ADMIN)["access_token"])


# ---- Login ----------------------------------------------------------------


def test_login_success_returns_tokens_and_user():
    data = login(*ADMIN)
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["user"]["role"] == "admin"
    assert data["user"]["full_name"] == "System Admin"


def test_login_wrong_password_is_401():
    resp = client.post("/auth/login", json={"email": ADMIN[0], "password": "nope"})
    assert resp.status_code == 401


def test_login_unknown_email_is_401_generic():
    resp = client.post("/auth/login", json={"email": "ghost@hospital.test", "password": "x"})
    assert resp.status_code == 401
    # Generic message must not reveal whether the email exists.
    assert "Invalid credentials" in resp.json()["error"]["message"]


def test_login_inactive_user_is_403():
    resp = client.post(
        "/auth/users",
        headers=admin_headers(),
        json={
            "email": "inactive@hospital.test",
            "password": "Hospital2025!",
            "full_name": "Inactive User",
            "role": "receptionist",
        },
    )
    assert resp.status_code == 201
    uid = resp.json()["id"]
    client.post(f"/auth/users/{uid}/deactivate", headers=admin_headers())
    r = client.post(
        "/auth/login", json={"email": "inactive@hospital.test", "password": "Hospital2025!"}
    )
    assert r.status_code == 403


# ---- Logout ---------------------------------------------------------------


def test_logout_revokes_refresh_token():
    data = login(*ADMIN)
    resp = client.post("/auth/logout", json={"refresh_token": data["refresh_token"]})
    assert resp.status_code == 204
    r = client.post("/auth/refresh", json={"refresh_token": data["refresh_token"]})
    assert r.status_code == 401


# ---- Refresh rotation -----------------------------------------------------


def test_refresh_rotates_and_old_token_rejected():
    data = login(*ADMIN)
    r = client.post("/auth/refresh", json={"refresh_token": data["refresh_token"]})
    assert r.status_code == 200
    new_refresh = r.json()["refresh_token"]
    assert new_refresh != data["refresh_token"]
    # Old refresh was rotated -> rejected.
    r2 = client.post("/auth/refresh", json={"refresh_token": data["refresh_token"]})
    assert r2.status_code == 401
    # New refresh still works.
    r3 = client.post("/auth/refresh", json={"refresh_token": new_refresh})
    assert r3.status_code == 200


def test_refresh_with_garbage_is_401():
    resp = client.post("/auth/refresh", json={"refresh_token": "not-a-real-token"})
    assert resp.status_code == 401


# ---- /me ------------------------------------------------------------------


def test_me_returns_role_and_permissions():
    data = login(*ADMIN)
    resp = client.get("/auth/me", headers=bearer(data["access_token"]))
    assert resp.status_code == 200
    body = resp.json()
    assert body["role"] == "admin"
    assert body["email"] == ADMIN[0]
    modules = {p["module"]: p["allowed"] for p in body["permissions"]}
    assert modules["patients"] is True
    assert modules["audit"] is True


def test_me_without_token_is_401():
    assert client.get("/auth/me").status_code == 401


def test_expired_access_token_is_401_not_500():
    settings = get_settings()
    now = int(time.time())
    expired = pyjwt.encode(
        {"sub": "1", "role": "admin", "iat": now - 3600, "exp": now - 60},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    resp = client.get("/auth/me", headers=bearer(expired))
    assert resp.status_code == 401


# ---- RBAC ----------------------------------------------------------------


def test_doctor_cannot_list_users_admin_can():
    doctor = login(*DOCTOR)
    assert client.get("/auth/users", headers=bearer(doctor["access_token"])).status_code == 403
    assert client.get("/auth/users", headers=admin_headers()).status_code == 200


def test_permission_update_by_non_admin_is_403():
    doctor = login(*DOCTOR)
    resp = client.put(
        "/auth/permissions/receptionist/billing",
        headers=bearer(doctor["access_token"]),
        json={"allowed": True},
    )
    assert resp.status_code == 403


# ---- Permission matrix ----------------------------------------------------


def test_permission_update_writes_audit_row():
    with _db_conn() as conn:
        max_id = conn.execute("SELECT COALESCE(MAX(id), 0) FROM audit_log").fetchone()[0]
    resp = client.put(
        "/auth/permissions/receptionist/billing",
        headers=admin_headers(),
        json={"allowed": True},
    )
    assert resp.status_code == 200
    assert resp.json()["allowed"] is True
    with _db_conn() as conn:
        rows = conn.execute(
            "SELECT action, entity_id FROM audit_log WHERE id > ? AND action = 'permission.update'",
            (max_id,),
        ).fetchall()
    assert rows, "expected a permission.update audit row"
    assert rows[-1]["entity_id"] == "receptionist/billing"


def test_permission_matrix_seeded_for_all_combos():
    with _db_conn() as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM permission_matrix WHERE role IN "
            "('admin','doctor','nurse','receptionist')"
        ).fetchone()[0]
    assert count == 4 * 7


def test_invalid_module_permission_update_is_422():
    resp = client.put(
        "/auth/permissions/admin/bogus",
        headers=admin_headers(),
        json={"allowed": True},
    )
    assert resp.status_code == 422


# ---- User management (admin) ---------------------------------------------


def test_create_and_patch_user_with_invalid_role_is_422():
    resp = client.post(
        "/auth/users",
        headers=admin_headers(),
        json={
            "email": "boss@hospital.test",
            "password": "Hospital2025!",
            "full_name": "Boss",
            "role": "boss",
        },
    )
    assert resp.status_code == 422


def test_admin_can_create_list_and_deactivate_user():
    resp = client.post(
        "/auth/users",
        headers=admin_headers(),
        json={
            "email": "newstaff@hospital.test",
            "password": "Hospital2025!",
            "full_name": "New Staff",
            "role": "nurse",
        },
    )
    assert resp.status_code == 201
    uid = resp.json()["id"]

    listing = client.get("/auth/users", headers=admin_headers()).json()["users"]
    assert any(u["email"] == "newstaff@hospital.test" for u in listing)

    # Invalid role on patch -> 422 without mutating.
    bad = client.patch(f"/auth/users/{uid}", headers=admin_headers(), json={"role": "boss"})
    assert bad.status_code == 422

    ok = client.patch(f"/auth/users/{uid}", headers=admin_headers(), json={"role": "receptionist"})
    assert ok.status_code == 200
    assert ok.json()["role"] == "receptionist"


def test_deactivate_invalidates_refresh_on_next_use():
    # Create + login a disposable user, then deactivate them.
    resp = client.post(
        "/auth/users",
        headers=admin_headers(),
        json={
            "email": "temp@hospital.test",
            "password": "Hospital2025!",
            "full_name": "Temp",
            "role": "doctor",
        },
    )
    uid = resp.json()["id"]
    login("temp@hospital.test", "Hospital2025!")  # establishes a session
    data2 = login("temp@hospital.test", "Hospital2025!")
    client.post(f"/auth/users/{uid}/deactivate", headers=admin_headers())
    r = client.post("/auth/refresh", json={"refresh_token": data2["refresh_token"]})
    assert r.status_code == 401


def test_no_public_signup_endpoint():
    resp = client.post("/auth/register", json={"email": "x@y.z", "password": "p"})
    assert resp.status_code == 404
    resp2 = client.post("/auth/signup", json={"email": "x@y.z", "password": "p"})
    assert resp2.status_code == 404


# ---- Forgot / reset password ---------------------------------------------


def test_forgot_password_always_204_and_creates_row(monkeypatch):
    # Create a dedicated user so we never clobber the ADMIN seed password.
    resp = client.post(
        "/auth/users",
        headers=admin_headers(),
        json={
            "email": "reset@hospital.test",
            "password": "Hospital2025!",
            "full_name": "Reset User",
            "role": "receptionist",
        },
    )
    assert resp.status_code == 201

    monkeypatch.setattr(auth_module, "create_refresh_token", lambda: "reset-token-abc")
    with _db_conn() as conn:
        before = conn.execute("SELECT COUNT(*) FROM password_resets").fetchone()[0]
    resp = client.post("/auth/forgot-password", json={"email": "reset@hospital.test"})
    assert resp.status_code == 204
    with _db_conn() as conn:
        row = conn.execute(
            "SELECT user_id, token_hash FROM password_resets WHERE token_hash = ?",
            (auth_module.hash_refresh_token("reset-token-abc"),),
        ).fetchone()
        total = conn.execute("SELECT COUNT(*) FROM password_resets").fetchone()[0]
    assert total == before + 1
    assert row is not None

    reset = client.post(
        "/auth/reset-password",
        json={"token": "reset-token-abc", "new_password": "NewPassword2025!"},
    )
    assert reset.status_code == 204

    # Old password now fails, new one works.
    assert (
        client.post(
            "/auth/login", json={"email": "reset@hospital.test", "password": "Hospital2025!"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/auth/login", json={"email": "reset@hospital.test", "password": "NewPassword2025!"}
        ).status_code
        == 200
    )


def test_forgot_password_unknown_email_still_204(monkeypatch):
    with _db_conn() as conn:
        before = conn.execute("SELECT COUNT(*) FROM password_resets").fetchone()[0]
    resp = client.post("/auth/forgot-password", json={"email": "nobody@hospital.test"})
    assert resp.status_code == 204
    with _db_conn() as conn:
        after = conn.execute("SELECT COUNT(*) FROM password_resets").fetchone()[0]
    assert after == before  # no row created for unknown email


def test_reset_password_with_bad_token_is_400():
    resp = client.post(
        "/auth/reset-password",
        json={"token": "bogus-token", "new_password": "NewPassword2025!"},
    )
    assert resp.status_code == 400


def test_change_password_flow():
    data = login(*DOCTOR)
    with _db_conn() as conn:
        max_id = conn.execute("SELECT COALESCE(MAX(id), 0) FROM audit_log").fetchone()[0]
    resp = client.post(
        "/auth/change-password",
        headers=bearer(data["access_token"]),
        json={"current_password": "Hospital2025!", "new_password": "ChangedPass2025!"},
    )
    assert resp.status_code == 204
    assert (
        client.post(
            "/auth/login", json={"email": DOCTOR[0], "password": "ChangedPass2025!"}
        ).status_code
        == 200
    )
    with _db_conn() as conn:
        row = conn.execute(
            "SELECT action FROM audit_log WHERE id > ? AND action = 'password.change'",
            (max_id,),
        ).fetchone()
    assert row is not None, "expected a password.change audit row"


# ---- Helpers --------------------------------------------------------------


from contextlib import contextmanager  # noqa: E402


@contextmanager
def _db_conn():
    import sqlite3

    conn = sqlite3.connect(_db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
