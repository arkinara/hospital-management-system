"""Ticket #41 — vitals capture, review queue & trend.

POST/GET vitals with server-side range validation, the critical-flag payload,
the doctor review queue with acknowledgement, and the charting trend series.
"""

from __future__ import annotations

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
            "full_name": f"Vitals {unique}",
            "dob": "1985-07-07",
            "phone": f"0813{uuid.uuid4().int & 0xFFFFFF:06d}",
            "national_id": f"77{uuid.uuid4().int & 0xFFFFFFFFFFFF:012d}",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _full_reading(**overrides):
    base = {
        "systolic": 120,
        "diastolic": 80,
        "heart_rate": 72,
        "spo2": 98,
        "temperature_c": 36.8,
        "respiratory_rate": 16,
    }
    base.update(overrides)
    return base


def _post_vitals(pid, overrides=None, creds=NURSE):
    return client.post(
        f"/medical-records/patients/{pid}/vitals",
        headers=_headers(creds),
        json=_full_reading(**(overrides or {})),
    )


# ---- Vitals entry ----------------------------------------------------------


def test_post_vitals_creates_reading_with_attribution():
    pid = _make_patient()
    r = _post_vitals(pid)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["systolic"] == 120
    assert body["recorded_by"] is not None
    assert body["recorded_at"] is not None
    assert body["critical"] is False


def test_post_vitals_critical_reading_flagged():
    pid = _make_patient()
    r = _post_vitals(pid, {"systolic": 190})
    assert r.status_code == 201, r.text
    assert r.json()["critical"] is True


def test_post_vitals_critical_low_spo2_flagged():
    pid = _make_patient()
    r = _post_vitals(pid, {"spo2": 85})
    assert r.status_code == 201
    assert r.json()["critical"] is True


def test_post_vitals_critical_heart_rate_flagged():
    pid = _make_patient()
    r = _post_vitals(pid, {"heart_rate": 140})
    assert r.status_code == 201
    assert r.json()["critical"] is True


def test_post_vitals_high_systolic_out_of_range_is_422():
    pid = _make_patient()
    r = _post_vitals(pid, {"systolic": 300})
    assert r.status_code == 422, r.text
    err = r.json().get("error", r.json())
    fields = r.json().get("fields") or []
    assert "systolic" in fields or "systolic" in str(err)


def test_post_vitals_implausible_spo2_is_422():
    pid = _make_patient()
    r = _post_vitals(pid, {"spo2": 30})
    assert r.status_code == 422
    fields = r.json().get("fields") or []
    assert "spo2" in fields


def test_post_vitals_missing_field_is_422():
    pid = _make_patient()
    r = client.post(
        f"/medical-records/patients/{pid}/vitals",
        headers=_headers(NURSE),
        json={"systolic": 120, "diastolic": 80, "heart_rate": 72},
    )
    assert r.status_code == 422


def test_post_vitals_linked_to_appointment():
    pid = _make_patient()
    with _db_conn() as conn:
        doctor_id = conn.execute(
            "SELECT id FROM users WHERE email = ?", (DOCTOR[0],)
        ).fetchone()[0]
        dept_id = conn.execute("SELECT id FROM departments ORDER BY id LIMIT 1").fetchone()[0]
        start = int((datetime.now(UTC) + timedelta(days=1)).replace(hour=9, minute=0).timestamp())
        cur = conn.execute(
            "INSERT INTO appointments (patient_id, doctor_id, department_id, scheduled_at, "
            "scheduled_end, duration_minutes, status, created_by, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, 30, 'booked', NULL, ?, ?)",
            (pid, doctor_id, dept_id, start, start + 1800, start, start),
        )
        appt_id = cur.lastrowid
    r = _post_vitals(pid, {"appointment_id": appt_id})
    assert r.status_code == 201, r.text
    assert r.json()["appointment_id"] == appt_id


# ---- Vitals list -----------------------------------------------------------


def test_list_vitals_newest_first():
    pid = _make_patient()
    _post_vitals(pid, {"systolic": 110})
    _post_vitals(pid, {"systolic": 130})
    r = client.get(
        f"/medical-records/patients/{pid}/vitals", headers=_headers(NURSE)
    )
    assert r.status_code == 200
    vitals = r.json()["vitals"]
    assert len(vitals) == 2
    assert vitals[0]["systolic"] == 130  # newest first


def test_list_vitals_empty_patient_returns_empty_array():
    pid = _make_patient()
    r = client.get(
        f"/medical-records/patients/{pid}/vitals", headers=_headers(NURSE)
    )
    assert r.status_code == 200
    assert r.json()["vitals"] == []


def test_list_vitals_from_to_filter():
    pid = _make_patient()
    _post_vitals(pid)
    now_iso = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    past_iso = (datetime.now(UTC) - timedelta(hours=2)).isoformat().replace("+00:00", "Z")
    r = client.get(
        f"/medical-records/patients/{pid}/vitals",
        params={"from": past_iso, "to": now_iso},
        headers=_headers(NURSE),
    )
    assert r.status_code == 200
    assert len(r.json()["vitals"]) >= 1


def test_list_vitals_from_after_to_is_422():
    pid = _make_patient()
    now_iso = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    future_iso = (datetime.now(UTC) + timedelta(hours=5)).isoformat().replace("+00:00", "Z")
    r = client.get(
        f"/medical-records/patients/{pid}/vitals",
        params={"from": future_iso, "to": now_iso},
        headers=_headers(NURSE),
    )
    assert r.status_code == 422


# ---- Trend -----------------------------------------------------------------


def test_trend_returns_ordered_series():
    pid = _make_patient()
    _post_vitals(pid, {"systolic": 110})
    _post_vitals(pid, {"systolic": 125})
    r = client.get(
        f"/medical-records/patients/{pid}/vitals/trend",
        params={"metric": "systolic"},
        headers=_headers(NURSE),
    )
    assert r.status_code == 200, r.text
    series = r.json()["series"]
    assert [s["value"] for s in series] == [110, 125]
    times = [s["recorded_at"] for s in series]
    assert times == sorted(times)


def test_trend_heart_rate_metric():
    pid = _make_patient()
    _post_vitals(pid, {"heart_rate": 88})
    r = client.get(
        f"/medical-records/patients/{pid}/vitals/trend",
        params={"metric": "hr"},
        headers=_headers(NURSE),
    )
    assert r.status_code == 200
    assert r.json()["series"][0]["value"] == 88


def test_trend_invalid_metric_is_422():
    pid = _make_patient()
    r = client.get(
        f"/medical-records/patients/{pid}/vitals/trend",
        params={"metric": "weight"},
        headers=_headers(NURSE),
    )
    assert r.status_code == 422


# ---- Review queue + acknowledgement ----------------------------------------


def test_review_queue_lists_recent_critical_readings():
    pid = _make_patient()
    created = _post_vitals(pid, {"systolic": 200})
    vital_id = created.json()["id"]
    r = client.get("/medical-records/vitals/review-queue", headers=_headers(DOCTOR))
    assert r.status_code == 200
    ids = [v["id"] for v in r.json()["queue"]]
    assert vital_id in ids
    entry = next(v for v in r.json()["queue"] if v["id"] == vital_id)
    assert entry["critical"] is True


def test_review_queue_nurse_is_forbidden():
    r = client.get("/medical-records/vitals/review-queue", headers=_headers(NURSE))
    assert r.status_code == 403


def test_review_queue_department_filter():
    pid = _make_patient()
    created = _post_vitals(pid, {"spo2": 88})
    vital_id = created.json()["id"]
    with _db_conn() as conn:
        dept_id = conn.execute(
            "SELECT id FROM departments ORDER BY id LIMIT 1"
        ).fetchone()[0]
    r = client.get(
        "/medical-records/vitals/review-queue",
        params={"department_id": dept_id},
        headers=_headers(DOCTOR),
    )
    assert r.status_code == 200
    # patient has no primary department, so it should not appear in the filtered queue
    ids = [v["id"] for v in r.json()["queue"]]
    assert vital_id not in ids


def test_acknowledge_removes_from_queue():
    pid = _make_patient()
    vital_id = _post_vitals(pid, {"heart_rate": 150}).json()["id"]
    ack = client.post(
        f"/medical-records/vitals/{vital_id}/acknowledge",
        headers=_headers(DOCTOR),
    )
    assert ack.status_code == 200, ack.text
    assert ack.json()["acknowledged_at"] is not None
    assert ack.json()["acknowledged_by"] is not None
    r = client.get("/medical-records/vitals/review-queue", headers=_headers(DOCTOR))
    ids = [v["id"] for v in r.json()["queue"]]
    assert vital_id not in ids


def test_acknowledge_twice_is_409():
    pid = _make_patient()
    vital_id = _post_vitals(pid, {"heart_rate": 150}).json()["id"]
    assert client.post(
        f"/medical-records/vitals/{vital_id}/acknowledge", headers=_headers(DOCTOR)
    ).status_code == 200
    r = client.post(
        f"/medical-records/vitals/{vital_id}/acknowledge", headers=_headers(DOCTOR)
    )
    assert r.status_code == 409


def test_acknowledge_unknown_reading_is_404():
    r = client.post(
        "/medical-records/vitals/999999/acknowledge", headers=_headers(DOCTOR)
    )
    assert r.status_code == 404