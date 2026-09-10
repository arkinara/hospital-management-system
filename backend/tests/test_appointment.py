"""Tests for the appointment domain (ticket #20).

Booking CRUD, server-enforced conflict detection, availability rules, the
doctor daily-schedule endpoint and the lifecycle transitions.

Reuses the isolated app/DB/client built by `test_auth` so there is a single
migrated + seeded SQLite database for the whole suite.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from test_auth import _db_conn, bearer, client, login

from app.services.availability import is_doctor_available  # noqa: E402

RECEPTIONIST = ("receptionist@hospital.test", "Hospital2025!")
DOCTOR = ("doctor@hospital.test", "Hospital2025!")
NURSE = ("nurse@hospital.test", "Hospital2025!")


def _headers(creds: tuple[str, str]) -> dict:
    return bearer(login(*creds)["access_token"])


def _ids() -> tuple[int, int, int]:
    with _db_conn() as conn:
        doctor_id = conn.execute(
            "SELECT id FROM users WHERE email = ?", ("sari.w@sirkaya.health",)
        ).fetchone()[0]
        patient_id = conn.execute("SELECT id FROM patients ORDER BY id LIMIT 1").fetchone()[0]
        dept_id = conn.execute("SELECT id FROM departments ORDER BY id LIMIT 1").fetchone()[0]
    return doctor_id, patient_id, dept_id


def _day(offset: int = 1) -> str:
    return (datetime.now(UTC).date() + timedelta(days=offset)).isoformat()


def _book(
    start: str,
    doctor_id: int,
    patient_id: int,
    dept_id: int,
    end: str | None = None,
    duration: int | None = None,
    creds: tuple[str, str] = RECEPTIONIST,
):
    body: dict = {
        "patient_id": patient_id,
        "doctor_id": doctor_id,
        "department_id": dept_id,
        "scheduled_start": start,
    }
    if end:
        body["scheduled_end"] = end
    if duration:
        body["duration_minutes"] = duration
    return client.post("/appointments", json=body, headers=_headers(creds))


# ---- Booking ---------------------------------------------------------------


def test_receptionist_can_book_appointment_201():
    doctor_id, patient_id, dept_id = _ids()
    resp = _book(f"{_day(1)}T09:00:00Z", doctor_id, patient_id, dept_id)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "booked"
    assert body["doctor_id"] == doctor_id
    assert body["scheduled_start"] == f"{_day(1)}T09:00:00Z"
    assert body["scheduled_end"] == f"{_day(1)}T09:30:00Z"
    assert body["created_by"] is not None


def test_create_missing_fields_is_422():
    doctor_id, _, _ = _ids()
    resp = client.post(
        "/appointments",
        json={"doctor_id": doctor_id},
        headers=_headers(RECEPTIONIST),
    )
    assert resp.status_code == 422


def test_create_unknown_patient_is_404():
    doctor_id, _, dept_id = _ids()
    resp = _book(f"{_day(1)}T09:00:00Z", doctor_id, 999999, dept_id)
    assert resp.status_code == 404


def test_create_unknown_doctor_is_404():
    _, patient_id, dept_id = _ids()
    resp = _book(f"{_day(1)}T09:00:00Z", 999999, patient_id, dept_id)
    assert resp.status_code == 404


# ---- Conflict detection ----------------------------------------------------


def test_same_doctor_overlap_is_409():
    doctor_id, patient_id, dept_id = _ids()
    first = _book(f"{_day(1)}T09:00:00Z", doctor_id, patient_id, dept_id)
    assert first.status_code == 201
    conflict = _book(
        f"{_day(1)}T09:15:00Z", doctor_id, patient_id, dept_id, end=f"{_day(1)}T09:45:00Z"
    )
    assert conflict.status_code == 409, conflict.text
    message = conflict.json()["error"]["message"]
    assert f"appointment {first.json()['id']}" in message


def test_same_doctor_non_overlapping_is_201():
    doctor_id, patient_id, dept_id = _ids()
    assert _book(f"{_day(1)}T10:00:00Z", doctor_id, patient_id, dept_id).status_code == 201
    resp = _book(f"{_day(1)}T11:00:00Z", doctor_id, patient_id, dept_id)
    assert resp.status_code == 201, resp.text


def test_cross_doctor_same_slot_is_201():
    doctor_id, patient_id, dept_id = _ids()
    with _db_conn() as conn:
        other_doctor = conn.execute(
            "SELECT id FROM users WHERE email = ?", ("adi.n@sirkaya.health",)
        ).fetchone()[0]
    assert _book(f"{_day(1)}T12:00:00Z", doctor_id, patient_id, dept_id).status_code == 201
    resp = _book(f"{_day(1)}T12:00:00Z", other_doctor, patient_id, dept_id)
    assert resp.status_code == 201, resp.text


def test_cancelled_appointment_does_not_block_rebook():
    doctor_id, patient_id, dept_id = _ids()
    booked = _book(f"{_day(1)}T14:00:00Z", doctor_id, patient_id, dept_id)
    assert booked.status_code == 201
    cancel = client.post(
        f"/appointments/{booked.json()['id']}/cancel",
        json={"reason": "patient rescheduled"},
        headers=_headers(RECEPTIONIST),
    )
    assert cancel.status_code == 200
    rebook = _book(f"{_day(1)}T14:00:00Z", doctor_id, patient_id, dept_id)
    assert rebook.status_code == 201, rebook.text


# ---- Availability rules ----------------------------------------------------


def test_booking_outside_working_hours_is_409():
    doctor_id, patient_id, dept_id = _ids()
    resp = _book(f"{_day(1)}T20:00:00Z", doctor_id, patient_id, dept_id)
    assert resp.status_code == 409, resp.text
    assert "unavailable" in resp.json()["error"]["message"]


def test_booking_on_blocked_day_is_409():
    doctor_id, patient_id, dept_id = _ids()
    avail = client.get(f"/doctors/{doctor_id}/availability", headers=_headers(RECEPTIONIST))
    blocked_dates = [b["date"] for b in avail.json()["blocked_days"]]
    assert blocked_dates, "seed should provide a blocked day for D01"
    resp = _book(f"{blocked_dates[0]}T10:00:00Z", doctor_id, patient_id, dept_id)
    assert resp.status_code == 409, resp.text


def test_doctor_schedule_returns_slot_grid():
    doctor_id, _, _ = _ids()
    resp = client.get(
        f"/doctors/{doctor_id}/schedule",
        params={"date": _day(1)},
        headers=_headers(RECEPTIONIST),
    )
    assert resp.status_code == 200, resp.text
    slots = resp.json()["slots"]
    assert slots, "expected a populated 15-minute grid"
    for i, slot in enumerate(slots[:-1]):
        assert slot["end_epoch"] - slot["start_epoch"] == 15 * 60
        assert slots[i + 1]["start_epoch"] == slot["end_epoch"]
        assert slot["status"] in ("free", "booked", "blocked")


def test_blocked_day_has_no_slots_in_schedule():
    doctor_id, _, _ = _ids()
    avail = client.get(f"/doctors/{doctor_id}/availability", headers=_headers(RECEPTIONIST))
    blocked = avail.json()["blocked_days"][0]["date"]
    resp = client.get(
        f"/doctors/{doctor_id}/schedule",
        params={"date": blocked},
        headers=_headers(RECEPTIONIST),
    )
    assert resp.status_code == 200
    assert resp.json()["slots"] == []


def test_is_doctor_available_integration():
    doctor_id, _, _ = _ids()
    start = int(datetime.fromisoformat(f"{_day(1)}T09:00:00+00:00").timestamp())
    assert is_doctor_available(doctor_id, start, start + 30 * 60) is True
    off_hours = int(datetime.fromisoformat(f"{_day(1)}T20:00:00+00:00").timestamp())
    assert is_doctor_available(doctor_id, off_hours, off_hours + 30 * 60) is False


# ---- Lifecycle -------------------------------------------------------------


def test_lifecycle_chain_book_checkin_start_complete():
    doctor_id, patient_id, dept_id = _ids()
    booked = _book(f"{_day(1)}T13:00:00Z", doctor_id, patient_id, dept_id)
    appt_id = booked.json()["id"]

    checked = client.post(f"/appointments/{appt_id}/check-in", headers=_headers(RECEPTIONIST))
    assert checked.status_code == 200, checked.text
    assert checked.json()["status"] == "checked_in"
    assert checked.json()["checked_in_at"] is not None

    started = client.post(f"/appointments/{appt_id}/start", headers=_headers(RECEPTIONIST))
    assert started.status_code == 200, started.text
    assert started.json()["status"] == "in_progress"

    completed = client.post(f"/appointments/{appt_id}/complete", headers=_headers(RECEPTIONIST))
    assert completed.status_code == 200, completed.text
    assert completed.json()["status"] == "completed"
    assert completed.json()["completed_at"] is not None

    detail = client.get(f"/appointments/{appt_id}", headers=_headers(RECEPTIONIST)).json()
    transitions = [(e["from_status"], e["to_status"]) for e in detail["lifecycle_events"]]
    assert transitions == [
        (None, "booked"),
        ("booked", "checked_in"),
        ("checked_in", "in_progress"),
        ("in_progress", "completed"),
    ]


def test_invalid_transition_is_409():
    doctor_id, patient_id, dept_id = _ids()
    booked = _book(f"{_day(1)}T15:00:00Z", doctor_id, patient_id, dept_id)
    appt_id = booked.json()["id"]
    # Cannot jump booked -> in_progress directly.
    resp = client.post(f"/appointments/{appt_id}/start", headers=_headers(RECEPTIONIST))
    assert resp.status_code == 409


def test_cancel_records_reason_and_lifecycle_event():
    doctor_id, patient_id, dept_id = _ids()
    booked = _book(f"{_day(1)}T16:00:00Z", doctor_id, patient_id, dept_id)
    appt_id = booked.json()["id"]
    resp = client.post(
        f"/appointments/{appt_id}/cancel",
        json={"reason": "patient no longer needs appointment"},
        headers=_headers(RECEPTIONIST),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "cancelled"

    detail = client.get(f"/appointments/{appt_id}", headers=_headers(RECEPTIONIST)).json()
    cancel_event = [e for e in detail["lifecycle_events"] if e["to_status"] == "cancelled"][0]
    assert cancel_event["reason"] == "patient no longer needs appointment"
    assert cancel_event["from_status"] == "booked"


def test_no_show_records_lifecycle_event():
    doctor_id, patient_id, dept_id = _ids()
    booked = _book(f"{_day(1)}T16:30:00Z", doctor_id, patient_id, dept_id)
    appt_id = booked.json()["id"]
    resp = client.post(f"/appointments/{appt_id}/no-show", json={}, headers=_headers(RECEPTIONIST))
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "no_show"


# ---- Update ----------------------------------------------------------------


def test_patch_reschedules_and_conflicts():
    doctor_id, patient_id, dept_id = _ids()
    booked = _book(f"{_day(1)}T09:00:00Z", doctor_id, patient_id, dept_id)
    appt_id = booked.json()["id"]
    second = _book(f"{_day(1)}T09:00:00Z", doctor_id, patient_id, dept_id)
    assert second.status_code == 409  # still conflicts before the move

    moved = client.patch(
        f"/appointments/{appt_id}",
        json={"scheduled_start": f"{_day(4)}T10:00:00Z"},
        headers=_headers(RECEPTIONIST),
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["scheduled_start"] == f"{_day(4)}T10:00:00Z"
    # The vacated slot is now free for a fresh booking.
    assert _book(f"{_day(1)}T09:00:00Z", doctor_id, patient_id, dept_id).status_code == 201


# ---- RBAC ------------------------------------------------------------------


def test_doctor_reads_only_own_appointments():
    doctor_id, patient_id, dept_id = _ids()
    book = _book(f"{_day(1)}T09:00:00Z", doctor_id, patient_id, dept_id)
    assert book.status_code == 201
    other_appt_id = book.json()["id"]

    listing = client.get("/appointments", headers=_headers(DOCTOR))
    assert listing.status_code == 200
    assert all(a["doctor_id"] == 17 for a in listing.json()["appointments"])

    forbidden = client.get(f"/appointments/{other_appt_id}", headers=_headers(DOCTOR))
    assert forbidden.status_code == 403


def test_nurse_reads_only_own_department():
    doctor_id, patient_id, dept_id = _ids()
    _book(f"{_day(1)}T09:00:00Z", doctor_id, patient_id, dept_id)
    listing = client.get("/appointments", headers=_headers(NURSE))
    assert listing.status_code == 200
    for appointment in listing.json()["appointments"]:
        assert appointment["department_id"] == 1  # nurse@hospital.test department


def test_doctor_cannot_edit_others_schedule():
    doctor_id, _, _ = _ids()
    resp = client.put(
        f"/doctors/{doctor_id}/availability",
        json={"windows": [{"weekday": 0, "start_time": "09:00", "end_time": "15:00"}]},
        headers=_headers(DOCTOR),
    )
    assert resp.status_code == 403


def test_availability_update_admin_or_self_only():
    doctor_id, _, _ = _ids()
    # Receptionist (not admin, not the doctor) is denied.
    resp = client.put(
        f"/doctors/{doctor_id}/availability",
        json={"windows": [{"weekday": 0, "start_time": "09:00", "end_time": "15:00"}]},
        headers=_headers(RECEPTIONIST),
    )
    assert resp.status_code == 403

    # A doctor may update their OWN availability.
    with _db_conn() as conn:
        own_doctor = conn.execute(
            "SELECT id FROM users WHERE email = ?", ("doctor@hospital.test",)
        ).fetchone()[0]
    resp = client.put(
        f"/doctors/{own_doctor}/availability",
        json={"windows": [{"weekday": 1, "start_time": "09:00", "end_time": "15:00"}]},
        headers=_headers(DOCTOR),
    )
    assert resp.status_code == 200, resp.text

    # Admin can update any doctor (use a doctor untouched by other tests).
    with _db_conn() as conn:
        other_doctor = conn.execute(
            "SELECT id FROM users WHERE email = ?", ("adi.n@sirkaya.health",)
        ).fetchone()[0]
    resp = client.put(
        f"/doctors/{other_doctor}/availability",
        json={"windows": [{"weekday": 0, "start_time": "09:00", "end_time": "15:00"}]},
        headers=_headers(("admin@hospital.test", "Hospital2025!")),
    )
    assert resp.status_code == 200, resp.text


# ---- Audit -----------------------------------------------------------------


def test_booking_and_transitions_write_audit_rows():
    with _db_conn() as conn:
        before = conn.execute("SELECT COALESCE(MAX(id), 0) FROM audit_log").fetchone()[0]
    doctor_id, patient_id, dept_id = _ids()
    booked = _book(f"{_day(1)}T09:00:00Z", doctor_id, patient_id, dept_id)
    appt_id = booked.json()["id"]
    client.post(f"/appointments/{appt_id}/check-in", headers=_headers(RECEPTIONIST))
    with _db_conn() as conn:
        actions = [
            r["action"]
            for r in conn.execute(
                "SELECT action FROM audit_log WHERE id > ? AND entity_id = ?",
                (before, str(appt_id)),
            )
        ]
    assert "appointment.create" in actions
    assert "appointment.check_in" in actions
