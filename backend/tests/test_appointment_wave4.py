"""Ticket #43 — appointment lifecycle, wait time & no-show guards.

Wait-time derivation on GET /appointments/{id}, the clinical-notes gate on
complete, no-show legality, and the admin wait-time reporting aggregate.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

from test_auth import _db_conn, bearer, client, login

ADMIN = ("admin@hospital.test", "Hospital2025!")
DOCTOR = ("doctor@hospital.test", "Hospital2025!")
NURSE = ("nurse@hospital.test", "Hospital2025!")
RECEPTIONIST = ("receptionist@hospital.test", "Hospital2025!")


def _headers(creds):
    return bearer(login(*creds)["access_token"])


def _ids():
    with _db_conn() as conn:
        doctor_id = conn.execute(
            "SELECT id FROM users WHERE email = ?", ("sari.w@sirkaya.health",)
        ).fetchone()[0]
        patient_id = conn.execute("SELECT id FROM patients ORDER BY id LIMIT 1").fetchone()[0]
        dept_id = conn.execute("SELECT id FROM departments ORDER BY id LIMIT 1").fetchone()[0]
    return doctor_id, patient_id, dept_id


def _day(offset=1):
    return (datetime.now(UTC).date() + timedelta(days=offset)).isoformat()


def _book(creds=RECEPTIONIST):
    doctor_id, patient_id, dept_id = _ids()
    r = client.post(
        "/appointments",
        headers=_headers(creds),
        json={
            "patient_id": patient_id,
            "doctor_id": doctor_id,
            "department_id": dept_id,
            "scheduled_start": f"{_day(1)}T09:00:00Z",
            "reason": "Wave4 lifecycle",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _check_in(appt_id, creds=RECEPTIONIST):
    return client.post(f"/appointments/{appt_id}/check-in", headers=_headers(creds))


# ---- Wait time -------------------------------------------------------------


def test_appointment_before_checkin_has_no_wait():
    appt_id = _book()
    r = client.get(f"/appointments/{appt_id}", headers=_headers(RECEPTIONIST))
    assert r.status_code == 200
    assert r.json()["wait_time_minutes"] is None
    assert r.json()["is_late"] is None


def test_checked_in_appointment_reports_wait_time():
    appt_id = _book()
    assert _check_in(appt_id).status_code == 200
    r = client.get(f"/appointments/{appt_id}", headers=_headers(RECEPTIONIST))
    body = r.json()
    assert body["status"] == "checked_in"
    assert body["wait_time_minutes"] is not None
    assert isinstance(body["wait_time_minutes"], int)
    assert body["is_late"] in (True, False)


def test_appointment_late_flag_when_arriving_after_scheduled():
    appt_id = _book()
    assert _check_in(appt_id).status_code == 200
    now = int(time.time())
    with _db_conn() as conn:
        # Arrival (checked_in_at) after the scheduled start marks the patient late.
        conn.execute(
            "UPDATE appointments SET checked_in_at = ?, scheduled_at = ? WHERE id = ?",
            (now, now - 3600, appt_id),
        )
    r = client.get(f"/appointments/{appt_id}", headers=_headers(RECEPTIONIST))
    assert r.json()["is_late"] is True


# ---- Complete clinical-notes gate ------------------------------------------


def test_complete_without_clinical_notes_is_422():
    appt_id = _book()
    _check_in(appt_id)
    client.post(f"/appointments/{appt_id}/start", headers=_headers(RECEPTIONIST))
    r = client.post(f"/appointments/{appt_id}/complete", headers=_headers(RECEPTIONIST))
    assert r.status_code == 422


def test_complete_with_clinical_notes_succeeds():
    appt_id = _book()
    _check_in(appt_id)
    client.post(f"/appointments/{appt_id}/start", headers=_headers(RECEPTIONIST))
    r = client.post(
        f"/appointments/{appt_id}/complete",
        json={"clinical_notes": "Follow-up in 2 weeks."},
        headers=_headers(RECEPTIONIST),
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "completed"
    assert r.json()["completed_at"] is not None


def test_complete_with_visit_note_id_succeeds():
    appt_id = _book()
    _check_in(appt_id)
    client.post(f"/appointments/{appt_id}/start", headers=_headers(RECEPTIONIST))
    with _db_conn() as conn:
        patient_id = conn.execute(
            "SELECT patient_id FROM appointments WHERE id = ?", (appt_id,)
        ).fetchone()[0]
        doctor_id = conn.execute(
            "SELECT doctor_id FROM appointments WHERE id = ?", (appt_id,)
        ).fetchone()[0]
        cur = conn.execute(
            "INSERT INTO visit_notes (patient_id, doctor_id, clinical_notes, status, created_at) "
            "VALUES (?, ?, 'linked note', 'draft', 0)",
            (patient_id, doctor_id),
        )
        visit_id = cur.lastrowid
    r = client.post(
        f"/appointments/{appt_id}/complete",
        json={"visit_note_id": visit_id},
        headers=_headers(RECEPTIONIST),
    )
    assert r.status_code == 200, r.text


# ---- No-show legality ------------------------------------------------------


def test_no_show_allowed_from_booked():
    appt_id = _book()
    r = client.post(
        f"/appointments/{appt_id}/no-show", json={}, headers=_headers(RECEPTIONIST)
    )
    assert r.status_code == 200
    assert r.json()["status"] == "no_show"


def test_no_show_allowed_from_checked_in():
    appt_id = _book()
    _check_in(appt_id)
    r = client.post(
        f"/appointments/{appt_id}/no-show", json={}, headers=_headers(RECEPTIONIST)
    )
    assert r.status_code == 200


def test_no_show_on_completed_is_409():
    appt_id = _book()
    _check_in(appt_id)
    client.post(f"/appointments/{appt_id}/start", headers=_headers(RECEPTIONIST))
    client.post(
        f"/appointments/{appt_id}/complete",
        json={"clinical_notes": "done"},
        headers=_headers(RECEPTIONIST),
    )
    r = client.post(
        f"/appointments/{appt_id}/no-show", json={}, headers=_headers(RECEPTIONIST)
    )
    assert r.status_code == 409


def test_no_show_on_cancelled_is_409():
    appt_id = _book()
    client.post(
        f"/appointments/{appt_id}/cancel", json={"reason": "moved"},
        headers=_headers(RECEPTIONIST),
    )
    r = client.post(
        f"/appointments/{appt_id}/no-show", json={}, headers=_headers(RECEPTIONIST)
    )
    assert r.status_code == 409


# ---- Wait-time stats -------------------------------------------------------


def test_wait_time_stats_admin_only():
    r = client.get("/appointments/wait-time-stats", headers=_headers(ADMIN))
    assert r.status_code == 200
    assert "stats" in r.json()
    denied = client.get("/appointments/wait-time-stats", headers=_headers(NURSE))
    assert denied.status_code == 403


def test_wait_time_stats_groups_by_doctor_and_day():
    appt_id = _book()
    _check_in(appt_id)
    client.post(f"/appointments/{appt_id}/start", headers=_headers(RECEPTIONIST))
    client.post(
        f"/appointments/{appt_id}/complete",
        json={"clinical_notes": "stats row"},
        headers=_headers(RECEPTIONIST),
    )
    r = client.get("/appointments/wait-time-stats", headers=_headers(ADMIN))
    assert r.status_code == 200
    stats = r.json()["stats"]
    assert stats, "completed checked-in appointment should produce a stat row"
    row = stats[0]
    assert "doctor_id" in row
    assert "day" in row
    assert row["appointments"] >= 1
    assert row["min_wait_minutes"] <= row["avg_wait_minutes"] <= row["max_wait_minutes"]


def test_wait_time_stats_date_window():
    r = client.get(
        "/appointments/wait-time-stats",
        params={"from": _day(0), "to": _day(3)},
        headers=_headers(ADMIN),
    )
    assert r.status_code == 200
    assert r.json()["stats"] == []