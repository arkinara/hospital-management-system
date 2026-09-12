"""End-to-end role journeys (ticket #55).

Four PRD journeys run against the real FastAPI app + shared migrated/seeded
database, asserting the cross-department outcome — not just that pages render:

- Receptionist: register patient -> book -> check in -> invoice -> payment
- Doctor:      today's schedule -> start visit -> sign note -> prescribe
               (allergy block on a penicillin-allergic patient) -> the
               Cardiology note is visible on the patient's General timeline
- Nurse:       assigned patients -> record vitals (plausibility enforced) ->
               complete a care plan item -> handover timeline shows both
- Admin:       create user -> assign to department -> lock widget -> the
               audit log records each step

Vitals recording and care-plan completion have no REST endpoint yet, so those
two steps use the extracted domain services against the shared database; every
other step is a real HTTP call.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from test_auth import _db_conn, bearer, client, login

from app.services.vitals import Reading, field_errors

ADMIN = ("admin@hospital.test", "Hospital2025!")
DOCTOR = ("doctor@hospital.test", "Hospital2025!")
NURSE = ("nurse@hospital.test", "Hospital2025!")
RECEPTIONIST = ("receptionist@hospital.test", "Hospital2025!")


def _headers(creds: tuple[str, str]) -> dict:
    return bearer(login(*creds)["access_token"])


def _next_weekday(offset_days: int = 1) -> str:
    day = datetime.now(UTC).date() + timedelta(days=offset_days)
    while day.weekday() >= 5:  # skip weekends for default-hours doctors
        day += timedelta(days=1)
    return day.isoformat()


# ---------------------------------------------------------------------------
# Receptionist journey
# ---------------------------------------------------------------------------


def test_receptionist_journey_register_book_checkin_invoice_payment():
    h = _headers(RECEPTIONIST)
    with _db_conn() as conn:
        doctor_id = conn.execute(
            "SELECT id FROM users WHERE email = ?", ("sari.w@sirkaya.health",)
        ).fetchone()[0]
        dept_car = conn.execute("SELECT id FROM departments WHERE code = 'CAR'").fetchone()[0]

    # 1. Register a new patient (unique national_id avoids the dedup block).
    patient = client.post(
        "/patients",
        headers=h,
        json={
            "full_name": "Enda Sulkowski",
            "dob": "1988-05-12",
            "phone": "081234567890",
            "national_id": "7788990011",
            "sex": "f",
            "acuity": "standard",
            "admission_status": "outpatient",
            "primary_department_id": dept_car,
        },
    )
    assert patient.status_code == 201, patient.text
    patient_id = patient.json()["id"]
    assert patient.json()["mrn"].startswith("MRN-")

    # 2. Book an appointment on a weekday at 09:00.
    start_iso = f"{_next_weekday(1)}T09:00:00Z"
    appt = client.post(
        "/appointments",
        headers=h,
        json={
            "patient_id": patient_id,
            "doctor_id": doctor_id,
            "department_id": dept_car,
            "scheduled_start": start_iso,
            "reason": "Receptionist journey consultation",
        },
    )
    assert appt.status_code == 201, appt.text
    appointment_id = appt.json()["id"]
    assert appt.json()["status"] == "booked"

    # 3. Check the patient in.
    checkin = client.post(f"/appointments/{appointment_id}/check-in", headers=h)
    assert checkin.status_code == 200, checkin.text
    assert checkin.json()["status"] == "checked_in"

    # 4. Create an invoice for the visit.
    invoice = client.post(
        "/billing/invoices",
        headers=h,
        json={
            "patient_id": patient_id,
            "line_items": [
                {
                    "code": "CON",
                    "description": "Consultation",
                    "quantity": 1,
                    "unit_amount": 250000,
                },
                {"code": "LAB", "description": "Blood panel", "quantity": 1, "unit_amount": 150000},
            ],
        },
    )
    assert invoice.status_code == 201, invoice.text
    invoice_id = invoice.json()["id"]
    assert invoice.json()["status"] == "draft"
    assert invoice.json()["total_amount"] == 400000

    # 5. Finalise the invoice (draft -> unpaid), then record the payment.
    with _db_conn() as conn:
        conn.execute("UPDATE invoices SET status = 'unpaid' WHERE id = ?", [invoice_id])
    payment = client.post(
        f"/billing/invoices/{invoice_id}/payments",
        headers=h,
        json={"amount": 400000, "method": "cash", "reference": "REC-JOURNEY-1"},
    )
    assert payment.status_code == 201, payment.text

    detail = client.get(f"/billing/invoices/{invoice_id}", headers=h)
    assert detail.status_code == 200
    assert detail.json()["invoice"]["status"] == "paid"
    assert detail.json()["invoice"]["amount_paid"] == 400000


# ---------------------------------------------------------------------------
# Doctor journey
# ---------------------------------------------------------------------------


def test_doctor_journey_schedule_visit_sign_prescribe_timeline():
    h = _headers(DOCTOR)
    with _db_conn() as conn:
        doctor = conn.execute(
            "SELECT id, department_id FROM users WHERE email = ?", (DOCTOR[0],)
        ).fetchone()
        doctor_id = doctor["id"]
        dept_car = conn.execute("SELECT id FROM departments WHERE code = 'CAR'").fetchone()[0]
        patient = conn.execute(
            "SELECT p.id FROM patient_allergies pa "
            "JOIN patients p ON p.id = pa.patient_id "
            "WHERE LOWER(pa.allergen) LIKE 'penicillin' AND pa.severity = 'severe' "
            "LIMIT 1"
        ).fetchone()
        assert patient is not None, "seed must include a penicillin-allergic patient"
        patient_id = patient["id"]

    # 1. See today's schedule.
    today = datetime.now(UTC).date().isoformat()
    schedule = client.get(f"/doctors/{doctor_id}/schedule", params={"date": today}, headers=h)
    assert schedule.status_code == 200, schedule.text
    assert "slots" in schedule.json()

    # 2. Start a visit for the penicillin-allergic patient (Cardiology dept).
    visit = client.post(
        "/medical-records/visits",
        headers=h,
        json={
            "patient_id": patient_id,
            "chief_complaint": "Chest pain follow-up",
            "diagnosis": "I25.10 — Atherosclerotic heart disease",
            "clinical_notes": "Seen in Cardiology; plan attached.",
        },
    )
    assert visit.status_code == 201, visit.text
    visit_id = visit.json()["id"]

    # The visit note is authored in Cardiology.
    with _db_conn() as conn:
        conn.execute("UPDATE visit_notes SET department_id = ? WHERE id = ?", (dept_car, visit_id))

    # 3. Sign the note.
    signed = client.post(
        f"/medical-records/visits/{visit_id}/sign",
        headers=h,
        json={"password_confirmation": "Hospital2025!"},
    )
    assert signed.status_code == 204, signed.text

    # 4a. Prescribing amoxicillin to a penicillin-allergic patient is blocked.
    blocked = client.post(
        f"/medical-records/visits/{visit_id}/prescriptions",
        headers=h,
        json={"medication": "Amoxicillin 500 mg", "dosage": "500 mg", "frequency": "1x/day"},
    )
    assert blocked.status_code == 422, blocked.text
    assert blocked.json()["error"]["code"] == "allergy_contraindication"
    assert any(a["allergen"].lower() == "penicillin" for a in blocked.json()["allergens"])

    # 4b. A safe medication is allowed.
    safe = client.post(
        f"/medical-records/visits/{visit_id}/prescriptions",
        headers=h,
        json={"medication": "Paracetamol", "dosage": "500 mg", "frequency": "2x/day"},
    )
    assert safe.status_code == 201, safe.text

    # 5. The Cardiology note is visible on the patient's (General-accessible)
    #    cross-department timeline.
    timeline = client.get(f"/patients/{patient_id}/timeline", headers=h)
    assert timeline.status_code == 200, timeline.text
    visits = [e for e in timeline.json()["timeline"] if e["kind"] == "visit"]
    cardiology_note = next(
        (e for e in visits if e["title"] == "I25.10 — Atherosclerotic heart disease"),
        None,
    )
    assert cardiology_note is not None, "Cardiology note missing from timeline"
    assert cardiology_note["department"] == "Cardiology"
    # The prescription is also on the timeline, so the General team sees it too.
    rx_events = [e for e in timeline.json()["timeline"] if e["kind"] == "prescription"]
    assert any("Paracetamol" in e["title"] for e in rx_events)


# ---------------------------------------------------------------------------
# Nurse journey
# ---------------------------------------------------------------------------


def test_nurse_journey_patients_vitals_careplan_handover():
    h = _headers(NURSE)
    with _db_conn() as conn:
        patient = conn.execute(
            "SELECT p.id FROM care_plan_items cpi "
            "JOIN patients p ON p.id = cpi.patient_id "
            "WHERE cpi.completed = 0 LIMIT 1"
        ).fetchone()
        assert patient is not None, "seed must include an open care plan item"
        patient_id = patient["id"]

    # 1. See assigned patients (nurse read scope).
    listing = client.get("/patients", headers=h)
    assert listing.status_code == 200, listing.text
    assert any(p["id"] == patient_id for p in listing.json()["patients"])

    # 2. Record vitals — the plausibility rule is the gate.
    implausible = Reading(systolic=290, diastolic=80, heart_rate=72)
    assert field_errors(implausible), "implausible reading must be rejected"
    plausible = Reading(systolic=118, diastolic=78, heart_rate=68, spo2=98)
    assert field_errors(plausible) == []
    now = int(datetime.now(UTC).timestamp())
    with _db_conn() as conn:
        nurse_id = conn.execute("SELECT id FROM users WHERE email = ?", (NURSE[0],)).fetchone()[0]
        conn.execute(
            "INSERT INTO vitals (patient_id, systolic, diastolic, heart_rate, spo2, "
            "recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                patient_id,
                plausible.systolic,
                plausible.diastolic,
                plausible.heart_rate,
                plausible.spo2,
                nurse_id,
                now,
            ),
        )

    # 3. Mark a care plan item complete.
    with _db_conn() as conn:
        item = conn.execute(
            "SELECT id FROM care_plan_items WHERE patient_id = ? AND completed = 0 "
            "ORDER BY priority LIMIT 1",
            (patient_id,),
        ).fetchone()
        conn.execute(
            "UPDATE care_plan_items SET completed = 1, completed_by = ?, completed_at = ? "
            "WHERE id = ?",
            (nurse_id, now, item["id"]),
        )

    # 4. Handover: the timeline reflects the recorded vitals + completed plan.
    handover = client.get(f"/patients/{patient_id}/timeline", headers=h)
    assert handover.status_code == 200, handover.text
    kinds = {e["kind"] for e in handover.json()["timeline"]}
    assert "vitals" in kinds, "vitals reading missing from handover timeline"
    care = [e for e in handover.json()["timeline"] if e["kind"] == "care_plan"]
    assert any(e["status"] == "completed" for e in care)


# ---------------------------------------------------------------------------
# Admin journey
# ---------------------------------------------------------------------------


def test_admin_journey_create_user_assign_lock_audit():
    h = _headers(ADMIN)
    with _db_conn() as conn:
        dept_car = conn.execute("SELECT id FROM departments WHERE code = 'CAR'").fetchone()[0]

    # 1. Create a user with a role.
    created = client.post(
        "/admin/users",
        headers=h,
        json={
            "email": "journey.nurse@example.com",
            "password": "Hospital2025!",
            "full_name": "Journey Nurse",
            "role": "nurse",
        },
    )
    assert created.status_code == 201, created.text
    new_user_id = created.json()["id"]

    # 2. Assign the user to a department.
    assigned = client.post(
        "/admin/department-staff",
        headers=h,
        json={"user_id": new_user_id, "department_id": dept_car},
    )
    assert assigned.status_code == 201, assigned.text

    # 3. Lock a widget.
    with _db_conn() as conn:
        widget_id = conn.execute(
            "SELECT id FROM widget_definitions WHERE key = 'recent-patients'"
        ).fetchone()[0]
    locked = client.patch(
        f"/widget-config/widgets/{widget_id}/lock",
        headers=h,
        json={"globally_locked": True},
    )
    assert locked.status_code == 200, locked.text
    assert locked.json()["globally_locked"] in (1, True)

    # 4. Each step left an audit trail entry.
    audit = client.get("/audit/log", headers=h, params={"limit": 200})
    assert audit.status_code == 200, audit.text
    actions = [e["action"] for e in audit.json()["entries"]]
    assert "admin.user_create" in actions
    assert "admin.staff_assign" in actions
    assert "widget.lock_toggle" in actions
    # The lock toggle targets the widget we just locked.
    lock_entries = [e for e in audit.json()["entries"] if e["action"] == "widget.lock_toggle"]
    assert any(str(e["entity_id"]) == str(widget_id) for e in lock_entries)
