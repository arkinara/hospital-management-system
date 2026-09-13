"""Tests for ticket #58: login rate limiting + temporary lockout.

The throttle reads the `login.failed` rows the auth router already writes, so
these tests drive real login attempts through the API and then assert on the
resulting behaviour (blocked attempts, counter reset, cooldown expiry).
"""

from __future__ import annotations

import time

from test_auth import ADMIN, bearer, client, login

from app.security import rate_limit as rl

PASSWORD = ADMIN[1]


def _fail(email: str, password: str = "wrong-password"):
    return client.post("/auth/login", json={"email": email, "password": password})


def _failures(email: str) -> int:
    return rl.count_failures(email, rl.get_settings().auth_lockout_window_seconds)


def _admin_headers() -> dict:
    return bearer(login(*ADMIN)["access_token"])


def test_threshold_reached_blocks_the_next_attempt():
    email = ADMIN[0]
    for _ in range(5):
        assert _fail(email).status_code == 401
    assert _failures(email) == 5

    # The sixth attempt is rejected before any credential work, so it neither
    # grants access nor records a new failure row.
    blocked = _fail(email, PASSWORD)
    assert blocked.status_code == 401
    assert blocked.json()["error"]["message"] == "Invalid credentials"
    assert _failures(email) == 5


def test_lockout_survives_repeated_attempts_within_cooldown():
    email = ADMIN[0]
    for _ in range(5):
        _fail(email)
    for _ in range(3):
        assert _fail(email, PASSWORD).status_code == 401


def test_successful_login_resets_the_email_counter():
    email = "doctor@hospital.test"
    for _ in range(3):
        _fail(email)
    assert _failures(email) == 3

    assert login(email, "Hospital2025!")["access_token"]
    assert _failures(email) == 0


def test_cooldown_elapsed_allows_login_again(monkeypatch):
    email = "nurse@hospital.test"
    for _ in range(5):
        _fail(email)
    assert _fail(email, "Hospital2025!").status_code == 401

    base = int(time.time())
    monkeypatch.setattr(rl.time, "time", lambda: base + 901)
    assert login(email, "Hospital2025!")["access_token"]


def test_email_case_and_whitespace_share_one_bucket():
    variants = [
        "Admin@hospital.test",
        " admin@hospital.test ",
        "ADMIN@HOSPITAL.TEST",
        "Admin@Hospital.Test",
        "  admin@hospital.test",
    ]
    for variant in variants:
        assert _fail(variant).status_code == 401

    assert _failures("admin@hospital.test") >= 5
    assert _fail("admin@hospital.test", PASSWORD).status_code == 401


def test_ip_throttle_fires_independently_of_email():
    for index in range(20):
        assert _fail(f"victim{index}@hospital.test").status_code == 401

    # A perfectly valid credential set is still refused because the host is
    # over its per-IP cap even though this email has no failures of its own.
    assert _failures(ADMIN[0]) == 0
    assert _fail(ADMIN[0], PASSWORD).status_code == 401


def test_lockout_response_matches_a_normal_rejection():
    normal = _fail("ghost@hospital.test")
    for _ in range(5):
        _fail(ADMIN[0])
    locked = _fail(ADMIN[0], PASSWORD)

    assert normal.status_code == locked.status_code == 401
    assert normal.json()["error"]["code"] == locked.json()["error"]["code"]
    assert normal.json()["error"]["message"] == locked.json()["error"]["message"]


def test_admin_can_see_current_lockouts():
    email = "receptionist@hospital.test"
    for _ in range(5):
        _fail(email)

    resp = client.get("/auth/lockouts", headers=_admin_headers())
    assert resp.status_code == 200
    body = resp.json()
    entry = next((item for item in body["lockouts"] if item["email"] == email), None)
    assert entry is not None
    assert entry["attempts"] >= 5
    assert entry["remaining_seconds"] > 0
    assert body["total"] >= 1


def test_lockouts_endpoint_is_admin_only():
    doctor = login("doctor@hospital.test", "Hospital2025!")
    resp = client.get("/auth/lockouts", headers=bearer(doctor["access_token"]))
    assert resp.status_code == 403
    assert client.get("/auth/lockouts").status_code == 401
