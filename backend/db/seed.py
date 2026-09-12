"""Seed the shared SQLite file from the frontend fixture set (ticket #38).

Usage: `python -m db.seed` (run from `backend/`). Must be run after migrate.

The dataset is defined once in `frontend/src/lib/fixtures/data.ts` and
serialised to `frontend/src/lib/fixtures/data.json` by `npm run sync:fixtures`.
This script reads that JSON, so the backend rows match the frontend fixtures
field for field. If the JSON is missing, run `npm run sync:fixtures` first.

Idempotent by construction: every row is guarded on a natural unique key or an
existence check (INSERT OR IGNORE / INSERT ... WHERE NOT EXISTS), so re-running
never duplicates rows. Passwords are bcrypt-hashed once and shared across the
seed accounts (documented dev password below).

Seed accounts (password: `Hospital2025!`):
  admin@hospital.test          admin
  doctor@hospital.test         doctor
  nurse@hospital.test          nurse
  receptionist@hospital.test   receptionist
"""

from __future__ import annotations

import json
import sqlite3
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.config import get_settings
from app.security import hash_password

BACKEND_DIR = Path(__file__).resolve().parents[1]
FIXTURES_PATH = BACKEND_DIR.parent / "frontend" / "src" / "lib" / "fixtures" / "data.json"

SEED_PASSWORD = "Hospital2025!"


def _load_fixtures() -> dict:
    if not FIXTURES_PATH.is_file():
        raise SystemExit(
            f"Fixture JSON not found at {FIXTURES_PATH}. "
            "Run `npm run sync:fixtures` in frontend/ first."
        )
    return json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))


def _epoch_utc() -> int:
    return int(time.time())


def _date_ts(value: str | None) -> int | None:
    if not value:
        return None
    return int(datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=UTC).timestamp())


def _iso_ts(value: str | None) -> int | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return int(dt.timestamp())
    except ValueError:
        return _date_ts(value[:10])


def _compact_ts(value: str | None) -> int | None:
    if not value or value == "—":
        return None
    try:
        return int(datetime.strptime(value, "%Y-%m-%d %H:%M").replace(tzinfo=UTC).timestamp())
    except ValueError:
        return _date_ts(value[:10])


def _appointment_ts(date: str, clock: str) -> int:
    hour, minute = clock.split(":")
    return int(
        datetime.strptime(date, "%Y-%m-%d")
        .replace(hour=int(hour), minute=int(minute), tzinfo=UTC)
        .timestamp()
    )


def _insert_if_absent(
    conn: sqlite3.Connection, insert_sql: str, check_sql: str, check_params, values: tuple
) -> int:
    """Insert one row only when the existence check finds nothing. Returns 1 or 0."""
    exists = conn.execute(check_sql, check_params).fetchone()
    if exists is not None:
        return 0
    conn.execute(insert_sql, values)
    return 1


def run_seed(db_path: Path) -> int:
    if not db_path.is_file():
        raise SystemExit(f"Database not found at {db_path}. Run `python -m db.migrate` first.")

    fx = _load_fixtures()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    now = _epoch_utc()
    inserted = 0

    # ---- Departments (code unique) ---------------------------------------
    cursor = conn.executemany(
        "INSERT OR IGNORE INTO departments "
        "(name, code, type, bed_capacity, min_clinicians_per_shift, active, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
            (
                d["name"],
                d["id"],
                d["type"],
                d["beds"],
                d["minCliniciansPerShift"],
                int(d["active"]),
                now,
            )
            for d in fx["allDepartments"]
        ],
    )
    inserted += cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0

    dept_id_by_code: dict[str, int] = {
        r["code"]: r["id"] for r in conn.execute("SELECT id, code FROM departments")
    }

    # ---- Users (email unique) --------------------------------------------
    password_hash = hash_password(SEED_PASSWORD)
    doctor_spec_by_email = {d["email"]: d["spec"] for d in fx["doctors"]}
    cursor = conn.executemany(
        "INSERT OR IGNORE INTO users "
        "(email, password_hash, full_name, role, department_id, specialisation, "
        "status, mfa_enabled, last_login_at, is_active, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
        [
            (
                u["email"],
                password_hash,
                u["name"],
                u["role"].lower(),
                dept_id_by_code.get(u["dept"]),
                doctor_spec_by_email.get(u["email"]),
                u["status"],
                int(u["mfa"]),
                _compact_ts(u["lastLogin"]),
                now,
            )
            for u in fx["users"]
        ],
    )
    inserted += cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0

    user_id_by_email: dict[str, int] = {
        r["email"]: r["id"] for r in conn.execute("SELECT id, email FROM users")
    }
    user_id_by_fixture: dict[str, int] = {
        u["id"]: user_id_by_email[u["email"]] for u in fx["users"]
    }

    # ---- Department staff (no unique key -> existence check) --------------
    for user in fx["users"]:
        if user["dept"] == "—" or user["id"] not in user_id_by_fixture:
            continue
        dept_id = dept_id_by_code.get(user["dept"])
        if dept_id is None:
            continue
        staff_user_id = user_id_by_fixture[user["id"]]
        inserted += _insert_if_absent(
            conn,
            "INSERT INTO department_staff (department_id, user_id, assigned_at) VALUES (?, ?, ?)",
            "SELECT 1 FROM department_staff WHERE department_id = ? AND user_id = ?",
            (dept_id, staff_user_id),
            (dept_id, staff_user_id, now),
        )

    # ---- Patients (mrn unique) -------------------------------------------
    cursor = conn.executemany(
        "INSERT OR IGNORE INTO patients "
        "(mrn, full_name, dob, sex, national_id, phone, acuity, admission_status, "
        "primary_department_id, payer_name, is_active, created_by, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
        [
            (
                p["mrn"],
                p["name"],
                _date_ts(p["dob"]),
                (p.get("sex") or "").lower() or None,
                p["nid"],
                p["phone"],
                p["acuity"],
                p["status"],
                dept_id_by_code.get(p["dept"]),
                p["insurer"],
                user_id_by_fixture.get("U-201"),
                now,
            )
            for p in fx["patients"]
        ],
    )
    inserted += cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0

    patient_id_by_mrn: dict[str, int] = {
        r["mrn"]: r["id"] for r in conn.execute("SELECT id, mrn FROM patients")
    }

    # ---- Patient departments (join; cross-department tracking) ------------
    for patient in fx["patients"]:
        patient_id = patient_id_by_mrn.get(patient["mrn"])
        dept_id = dept_id_by_code.get(patient["dept"])
        if patient_id is None or dept_id is None:
            continue
        inserted += _insert_if_absent(
            conn,
            "INSERT INTO patient_departments (patient_id, department_id, since_date) "
            "VALUES (?, ?, ?)",
            "SELECT 1 FROM patient_departments WHERE patient_id = ? AND department_id = ?",
            (patient_id, dept_id),
            (patient_id, dept_id, now),
        )


    # ---- Allergies (no unique key -> existence check) ---------------------
    noted_by: dict[str, int | None] = {
        uid: user_id_by_fixture.get(uid) for uid in ("U-104", "U-203")
    }
    for allergy in fx["patientAllergies"]:
        patient_id = patient_id_by_mrn.get(allergy["patient"])
        if patient_id is None:
            continue
        inserted += _insert_if_absent(
            conn,
            "INSERT INTO patient_allergies (patient_id, allergen, severity, noted_by, noted_at) "
            "VALUES (?, ?, ?, ?, ?)",
            "SELECT 1 FROM patient_allergies WHERE patient_id = ? AND allergen = ?",
            (patient_id, allergy["substance"]),
            (
                patient_id,
                allergy["substance"],
                allergy["severity"],
                noted_by.get(allergy["notedBy"]),
                _iso_ts(allergy["notedAt"]),
            ),
        )

    # ---- Appointments (natural key: patient + doctor + scheduled_at) ------
    doctor_user_by_id = {d["id"]: user_id_by_email.get(d["email"]) for d in fx["doctors"]}
    receptionist_id = user_id_by_fixture.get("U-105")
    for appt in fx["appointments"]:
        patient_id = patient_id_by_mrn.get(appt["patient"])
        doctor_id = doctor_user_by_id.get(appt["doctor"])
        if patient_id is None or doctor_id is None:
            continue
        scheduled_at = _appointment_ts(appt["date"], appt["time"])
        scheduled_end = scheduled_at + 30 * 60
        inserted += _insert_if_absent(
            conn,
            "INSERT INTO appointments (patient_id, doctor_id, department_id, scheduled_at, "
            "scheduled_end, duration_minutes, reason, notes, status, checked_in_at, "
            "created_by, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            "SELECT 1 FROM appointments WHERE patient_id = ? AND doctor_id = ? "
            "AND scheduled_at = ?",
            (patient_id, doctor_id, scheduled_at),
            (
                patient_id,
                doctor_id,
                dept_id_by_code.get(appt["dept"]),
                scheduled_at,
                scheduled_end,
                30,
                appt["reason"],
                None,
                appt["status"],
                _iso_ts(appt["checkedInAt"]),
                receptionist_id,
                now,
                now,
            ),
        )

    appointment_id_by_key: dict[str, int] = {}
    for appt in fx["appointments"]:
        patient_id = patient_id_by_mrn.get(appt["patient"])
        doctor_id = doctor_user_by_id.get(appt["doctor"])
        if patient_id is None or doctor_id is None:
            continue
        scheduled_at = _appointment_ts(appt["date"], appt["time"])
        row = conn.execute(
            "SELECT id FROM appointments WHERE patient_id = ? AND doctor_id = ? "
            "AND scheduled_at = ?",
            (patient_id, doctor_id, scheduled_at),
        ).fetchone()
        if row is not None:
            appointment_id_by_key[appt["id"]] = row["id"]

    # ---- Cross-department joins (from appointments) ------------------------
    for appt in fx["appointments"]:
        patient_id = patient_id_by_mrn.get(appt["patient"])
        dept_id = dept_id_by_code.get(appt["dept"])
        if patient_id is None or dept_id is None:
            continue
        inserted += _insert_if_absent(
            conn,
            "INSERT INTO patient_departments (patient_id, department_id, since_date) "
            "VALUES (?, ?, ?)",
            "SELECT 1 FROM patient_departments WHERE patient_id = ? AND department_id = ?",
            (patient_id, dept_id),
            (patient_id, dept_id, now),
        )

    # ---- Doctor availability (default weekly hours, idempotent) -----------
    # Doctors with no configured windows default to 08:00-17:00 every day so
    # the slot grid is useful straight after seeding regardless of the day the
    # suite or a fresh deployment runs on.
    for doc in fx["doctors"]:
        doctor_user_id = doctor_user_by_id.get(doc["id"])
        if doctor_user_id is None:
            continue
        for weekday in range(7):  # Mon–Sun
            inserted += _insert_if_absent(
                conn,
                "INSERT INTO doctor_availability "
                "(doctor_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)",
                "SELECT 1 FROM doctor_availability WHERE doctor_id = ? "
                "AND day_of_week = ? AND start_time = ?",
                (doctor_user_id, weekday, "08:00"),
                (doctor_user_id, weekday, "08:00", "17:00"),
            )

    # ---- Doctor blocked days (vacation/sick, idempotent) ------------------
    blocked_specs = [
        (fx["doctors"][0]["id"], 10, "vacation"),
        (fx["doctors"][1]["id"], 3, "off-site training"),
    ]
    for doc_id, offset_days, reason in blocked_specs:
        doctor_user_id = doctor_user_by_id.get(doc_id)
        if doctor_user_id is None:
            continue
        blocked_date = (datetime.now(UTC).date() + timedelta(days=offset_days)).isoformat()
        inserted += _insert_if_absent(
            conn,
            "INSERT INTO doctor_blocked_days (doctor_id, blocked_date, reason) "
            "VALUES (?, ?, ?)",
            "SELECT 1 FROM doctor_blocked_days WHERE doctor_id = ? AND blocked_date = ?",
            (doctor_user_id, blocked_date),
            (doctor_user_id, blocked_date, reason),
        )

    # ---- Appointment lifecycle events (derived from fixture status) -------
    for appt in fx["appointments"]:
        appointment_id = appointment_id_by_key.get(appt["id"])
        if appointment_id is None:
            continue
        scheduled_at = _appointment_ts(appt["date"], appt["time"])
        created_at = now
        inserted += _insert_if_absent(
            conn,
            "INSERT INTO appointment_lifecycle_events "
            "(appointment_id, from_status, to_status, occurred_at, by_user_id, reason) "
            "VALUES (?, NULL, 'booked', ?, ?, NULL)",
            "SELECT 1 FROM appointment_lifecycle_events WHERE appointment_id = ? "
            "AND to_status = 'booked' AND from_status IS NULL",
            (appointment_id,),
            (appointment_id, created_at, receptionist_id),
        )
        status = appt["status"]
        if status != "booked":
            inserted += _insert_if_absent(
                conn,
                "INSERT INTO appointment_lifecycle_events "
                "(appointment_id, from_status, to_status, occurred_at, by_user_id, reason) "
                "VALUES (?, 'booked', ?, ?, ?, ?)",
                "SELECT 1 FROM appointment_lifecycle_events WHERE appointment_id = ? "
                "AND to_status = ?",
                (appointment_id, status),
                (
                    appointment_id,
                    status,
                    created_at + 60,
                    receptionist_id,
                    None if status in ("checked_in", "in_progress", "completed") else "per fixture",
                ),
            )

    # ---- Visit notes ------------------------------------------------------
    note_doctor_by_id = doctor_user_by_id
    for note in fx["visitNotes"]:
        patient_id = patient_id_by_mrn.get(note["patient"])
        doctor_id = note_doctor_by_id.get(note["doctor"])
        if patient_id is None or doctor_id is None:
            continue
        created_at = _iso_ts(note["createdAt"]) or now
        row = conn.execute(
            "SELECT id FROM visit_notes WHERE patient_id = ? AND doctor_id = ? AND created_at = ?",
            (patient_id, doctor_id, created_at),
        ).fetchone()
        if row is not None:
            continue
        conn.execute(
            "INSERT INTO visit_notes "
            "(appointment_id, patient_id, doctor_id, chief_complaint, diagnosis, clinical_notes, "
            "department_id, status, signed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                appointment_id_by_key.get(note["appointmentId"]),
                patient_id,
                doctor_id,
                note["chiefComplaint"],
                note["diagnosis"],
                note["clinicalNotes"],
                dept_id_by_code.get(note["dept"]),
                note["status"],
                _iso_ts(note["signedAt"]),
                created_at,
            ),
        )
        inserted += 1

    note_id_by_fixture: dict[str, int] = {}
    for note in fx["visitNotes"]:
        patient_id = patient_id_by_mrn.get(note["patient"])
        doctor_id = note_doctor_by_id.get(note["doctor"])
        created_at = _iso_ts(note["createdAt"]) or now
        row = conn.execute(
            "SELECT id FROM visit_notes WHERE patient_id = ? AND doctor_id = ? AND created_at = ?",
            (patient_id, doctor_id, created_at),
        ).fetchone()
        if row is not None:
            note_id_by_fixture[note["id"]] = row["id"]

    # ---- Cross-department joins (from visit notes) -------------------------
    for note in fx["visitNotes"]:
        patient_id = patient_id_by_mrn.get(note["patient"])
        dept_id = dept_id_by_code.get(note["dept"])
        if patient_id is None or dept_id is None:
            continue
        inserted += _insert_if_absent(
            conn,
            "INSERT INTO patient_departments (patient_id, department_id, since_date) "
            "VALUES (?, ?, ?)",
            "SELECT 1 FROM patient_departments WHERE patient_id = ? AND department_id = ?",
            (patient_id, dept_id),
            (patient_id, dept_id, now),
        )

    # ---- Prescriptions ----------------------------------------------------
    for pres in fx["prescriptions"]:
        visit_note_id = note_id_by_fixture.get(pres["visitNoteId"])
        if visit_note_id is None:
            continue
        inserted += _insert_if_absent(
            conn,
            "INSERT INTO prescriptions (visit_note_id, medication, dosage, frequency, "
            "duration_days, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            "SELECT 1 FROM prescriptions WHERE visit_note_id = ? AND medication = ?",
            (visit_note_id, pres["medication"]),
            (
                visit_note_id,
                pres["medication"],
                pres["dosage"],
                pres["frequency"],
                pres["durationDays"],
                now,
            ),
        )

    # ---- Vitals -----------------------------------------------------------
    vitals_rows = [
        (
            patient_id_by_mrn.get(v["patient"]),
            v["systolic"],
            v["diastolic"],
            v["heartRate"],
            v["spo2"],
            v["temperatureC"],
            v["respiratoryRate"],
            user_id_by_fixture.get(v["recordedBy"]),
            _iso_ts(v["recordedAt"]),
        )
        for v in fx["vitalReadings"]
        if patient_id_by_mrn.get(v["patient"]) is not None
    ]
    for row in vitals_rows:
        inserted += _insert_if_absent(
            conn,
            "INSERT INTO vitals (patient_id, systolic, diastolic, heart_rate, spo2, "
            "temperature_c, respiratory_rate, recorded_by, recorded_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            "SELECT 1 FROM vitals WHERE patient_id = ? AND recorded_at = ?",
            (row[0], row[8]),
            row,
        )

    # ---- Care plan items --------------------------------------------------
    for item in fx["carePlanItems"]:
        patient_id = patient_id_by_mrn.get(item["patient"])
        if patient_id is None:
            continue
        inserted += _insert_if_absent(
            conn,
            "INSERT INTO care_plan_items (patient_id, source_visit_note_id, description, due_at, "
            "priority, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            "SELECT 1 FROM care_plan_items WHERE patient_id = ? AND description = ?",
            (patient_id, item["description"]),
            (
                patient_id,
                note_id_by_fixture.get(item["sourceVisitNoteId"]),
                item["description"],
                _iso_ts(item["dueAt"]),
                item["priority"],
                int(item["completed"]),
                now,
            ),
        )

    # ---- Invoices ---------------------------------------------------------
    invoice_id_by_fixture: dict[str, int] = {}
    for inv in fx["invoices"]:
        patient_id = patient_id_by_mrn.get(inv["patient"])
        if patient_id is None:
            continue
        created_at = _date_ts(inv["date"]) or now
        row = conn.execute(
            "SELECT id FROM invoices WHERE patient_id = ? AND created_at = ? AND total_amount = ?",
            (patient_id, created_at, inv["total"]),
        ).fetchone()
        if row is None:
            cursor = conn.execute(
                "INSERT INTO invoices (patient_id, payer_name, total_amount, "
                "amount_paid, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    patient_id,
                    inv["insurer"],
                    inv["total"],
                    inv["paid"],
                    inv["status"],
                    created_at,
                ),
            )
            invoice_id_by_fixture[inv["id"]] = cursor.lastrowid
            inserted += 1
        else:
            invoice_id_by_fixture[inv["id"]] = row["id"]

    # ---- Invoice line items ----------------------------------------------
    def _item_type(code: str) -> str:
        if code.startswith("PHARM"):
            return "medication"
        if code.startswith("ROOM"):
            return "room"
        if code.startswith("PROC"):
            return "procedure"
        return "consultation"

    for inv in fx["invoices"]:
        invoice_id = invoice_id_by_fixture.get(inv["id"])
        if invoice_id is None:
            continue
        for line in inv.get("lines", []):
            inserted += _insert_if_absent(
                conn,
                "INSERT INTO invoice_line_items (invoice_id, code, description, quantity, "
                "unit_amount, item_type, department_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
                "SELECT 1 FROM invoice_line_items WHERE invoice_id = ? AND code = ?",
                (invoice_id, line["code"]),
                (
                    invoice_id,
                    line["code"],
                    line["desc"],
                    line["qty"],
                    line["unit"],
                    _item_type(line["code"]),
                    dept_id_by_code.get(line["dept"]),
                ),
            )

    # ---- Payments ---------------------------------------------------------
    for payment in fx["payments"]:
        invoice_id = invoice_id_by_fixture.get(payment["invoiceId"])
        if invoice_id is None:
            continue
        paid_at = _iso_ts(payment["paidAt"]) or now
        inserted += _insert_if_absent(
            conn,
            "INSERT INTO payments (invoice_id, amount, method, reference, paid_at) "
            "VALUES (?, ?, ?, ?, ?)",
            "SELECT 1 FROM payments WHERE invoice_id = ? AND amount = ? AND paid_at = ?",
            (invoice_id, payment["amount"], paid_at),
            (
                invoice_id,
                payment["amount"],
                payment["method"],
                payment["reference"],
                paid_at,
            ),
        )

    # ---- Insurance claims -------------------------------------------------
    for claim in fx["claims"]:
        invoice_id = invoice_id_by_fixture.get(claim["invoiceId"])
        if invoice_id is None:
            continue
        inserted += _insert_if_absent(
            conn,
            "INSERT INTO insurance_claims (invoice_id, payer_name, claim_number, status, "
            "denial_reason, appeal_deadline, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            "SELECT 1 FROM insurance_claims WHERE invoice_id = ? AND claim_number = ?",
            (invoice_id, claim["claimNumber"]),
            (
                invoice_id,
                claim["payerName"],
                claim["claimNumber"],
                claim["status"],
                claim["denialReason"],
                _date_ts(claim["appealDeadline"]),
                _iso_ts(claim["submittedAt"]),
            ),
        )

    # ---- Permission matrix (role, module unique; upsert so fixture edits
    # ---- like nurse->appointments read access apply to existing DBs) -----
    cursor = conn.executemany(
        "INSERT INTO permission_matrix "
        "(role, module, allowed, can_view, can_create, can_edit, can_delete) "
        "VALUES (?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(role, module) DO UPDATE SET "
        "allowed = excluded.allowed, can_view = excluded.can_view, "
        "can_create = excluded.can_create, can_edit = excluded.can_edit, "
        "can_delete = excluded.can_delete",
        [
            (
                entry["role"],
                entry["module"],
                int(entry["allowed"]),
                int(entry["canView"]),
                int(entry["canCreate"]),
                int(entry["canEdit"]),
                int(entry["canDelete"]),
            )
            for entry in fx["permissionMatrix"]
        ],
    )
    inserted += cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0

    # ---- Widgets (key unique) ---------------------------------------------
    cursor = conn.executemany(
        "INSERT OR IGNORE INTO widget_definitions "
        "(key, name, default_role, globally_enabled, globally_locked) VALUES (?, ?, ?, ?, ?)",
        [
            (w["key"], w["name"], w["roles"][0].lower(), int(w["enabled"]), int(w["locked"]))
            for w in fx["widgets"]
        ],
    )
    inserted += cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0

    widget_id_by_key: dict[str, int] = {
        r["key"]: r["id"] for r in conn.execute("SELECT id, key FROM widget_definitions")
    }

    # ---- Widget layouts ---------------------------------------------------
    for layout in fx["widgetLayouts"]:
        user_id = user_id_by_fixture.get(layout["userId"])
        widget_id = widget_id_by_key.get(layout["widgetKey"])
        if user_id is None or widget_id is None:
            continue
        inserted += _insert_if_absent(
            conn,
            "INSERT INTO user_widget_layout (user_id, widget_id, position_order, enabled, size) "
            "VALUES (?, ?, ?, ?, ?)",
            "SELECT 1 FROM user_widget_layout WHERE user_id = ? AND widget_id = ?",
            (user_id, widget_id),
            (user_id, widget_id, layout["positionOrder"], int(layout["enabled"]), layout["size"]),
        )

    # ---- Audit bootstrap marker (idempotent) ------------------------------
    has_init = conn.execute(
        "SELECT 1 FROM audit_log WHERE action = 'system.init' LIMIT 1"
    ).fetchone()
    if has_init is None:
        conn.execute(
            "INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, "
            "after_json, created_at) VALUES (NULL, 'system.init', 'system', NULL, NULL, ?)",
            (now,),
        )
        inserted += 1

    conn.commit()
    conn.close()
    return inserted


def main() -> int:
    db_path = get_settings().resolved_database_path
    inserted = run_seed(db_path)
    print(f"db.seed: {inserted} row(s) inserted into {db_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
