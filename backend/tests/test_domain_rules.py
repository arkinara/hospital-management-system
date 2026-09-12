"""Domain rule unit tests (ticket #55).

Pure-function tests over the algorithmic rules that are cheap to break and
expensive to notice: dedup matching, appointment conflict detection, payment
status transitions, permission dependency, widget lock resolution, vitals
plausibility, care-plan priority ordering, invoice numbering, and allergy
contraindication matching.

Tests that need a database use the shared migrated + seeded SQLite file via
`_db_conn` (the conftest autouse fixture resets it before every test), and
insert only the rows a given test asserts on.
"""

from __future__ import annotations

from test_auth import _db_conn

from app.services.allergy import RecordedAllergy, match_contraindication
from app.services.billing import compute_payment_status, next_invoice_number
from app.services.care_plan import sort_by_priority
from app.services.conflict import appointment_end, find_doctor_conflict
from app.services.dedup import (
    FUZZY_THRESHOLD,
    check_duplicates,
    find_exact_national_id,
    find_fuzzy_name_dob,
    levenshtein,
    name_similarity,
    normalize_name,
)
from app.services.permissions import grant, is_consistent, revoke
from app.services.vitals import Reading, field_errors, is_plausible
from app.services.widget_lock import can_remove, resolve_layout

# ---------------------------------------------------------------------------
# Dedup matching (#19)
# ---------------------------------------------------------------------------


def test_normalize_name_collapses_whitespace_and_case():
    assert normalize_name("  John   Doe  ") == "john doe"
    assert normalize_name(None) == ""
    assert normalize_name("") == ""


def test_levenshtein_known_distances():
    assert levenshtein("", "") == 0
    assert levenshtein("kitten", "sitting") == 3
    assert levenshtein("john", "john") == 0
    assert levenshtein("abc", "abcx") == 1


def test_name_similarity_single_edit_scores_high():
    assert name_similarity("John Doe", "John Doe") == 1.0
    # One edit in a 10-char name -> 0.9, above the 0.85 fuzzy threshold.
    assert name_similarity("John Doee", "John Doe") >= FUZZY_THRESHOLD


def test_name_similarity_different_names_below_threshold():
    assert name_similarity("Alice Smith", "Bob Jones") < FUZZY_THRESHOLD
    assert name_similarity(None, "Bob Jones") == 0.0


def test_exact_national_id_is_hard_match():
    with _db_conn() as conn:
        conn.execute(
            "INSERT INTO patients (mrn, full_name, dob, national_id, is_active, created_at) "
            "VALUES ('MRN-700001', 'Dup Target', 0, '9911991199', 1, 0)"
        )
        suspect = find_exact_national_id(conn, "9911991199")
    assert suspect is not None
    assert suspect.match_type == "national_id"
    assert suspect.similarity == 1.0


def test_check_duplicates_returns_exact_match_first():
    with _db_conn() as conn:
        conn.execute(
            "INSERT INTO patients (mrn, full_name, dob, national_id, is_active, created_at) "
            "VALUES ('MRN-700002', 'Dup Exact', 0, '8822882288', 1, 0)"
        )
        suspects = check_duplicates(conn, "8822882288", "Totally Different Name", 0)
    assert len(suspects) == 1
    assert suspects[0].match_type == "national_id"


def test_check_duplicates_fuzzy_name_dob():
    with _db_conn() as conn:
        conn.execute(
            "INSERT INTO patients (mrn, full_name, dob, national_id, is_active, created_at) "
            "VALUES ('MRN-700003', 'Sara Connerr', 1234567, NULL, 1, 0)"
        )
        suspects = check_duplicates(conn, None, "Sara Conner", 1234567)
    assert any(s.match_type == "fuzzy_name_dob" for s in suspects)


def test_fuzzy_does_not_match_wrong_dob():
    with _db_conn() as conn:
        conn.execute(
            "INSERT INTO patients (mrn, full_name, dob, national_id, is_active, created_at) "
            "VALUES ('MRN-700004', 'Sara Connerr', 9999999, NULL, 1, 0)"
        )
        suspects = find_fuzzy_name_dob(conn, "Sara Conner", 1234567)
    assert suspects == []


# ---------------------------------------------------------------------------
# Appointment conflict detection (#20)
# ---------------------------------------------------------------------------


def _seed_appointment(
    conn,
    doctor_id: int,
    patient_id: int,
    start: int,
    end: int,
    status: str = "booked",
) -> int:
    cur = conn.execute(
        "INSERT INTO appointments (patient_id, doctor_id, scheduled_at, scheduled_end, "
        "duration_minutes, status, created_by, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 0)",
        (patient_id, doctor_id, start, end, (end - start) // 60, status),
    )
    return cur.lastrowid


def _doctor_and_patient() -> tuple[int, int]:
    with _db_conn() as conn:
        doctor_id = conn.execute(
            "SELECT id FROM users WHERE email = ?", ("sari.w@sirkaya.health",)
        ).fetchone()[0]
        patient_id = conn.execute("SELECT id FROM patients ORDER BY id LIMIT 1").fetchone()[0]
    return doctor_id, patient_id


def test_overlapping_booking_is_conflict():
    doctor_id, patient_id = _doctor_and_patient()
    with _db_conn() as conn:
        _seed_appointment(conn, doctor_id, patient_id, 1000, 1030)
        conflict = find_doctor_conflict(conn, doctor_id, 1015, 1045)
    assert conflict is not None
    assert conflict.status == "booked"


def test_adjacent_appointments_do_not_conflict():
    doctor_id, patient_id = _doctor_and_patient()
    with _db_conn() as conn:
        _seed_appointment(conn, doctor_id, patient_id, 1000, 1030)
        assert find_doctor_conflict(conn, doctor_id, 1030, 1100) is None


def test_cancelled_slot_is_free_for_rebooking():
    doctor_id, patient_id = _doctor_and_patient()
    with _db_conn() as conn:
        _seed_appointment(conn, doctor_id, patient_id, 1000, 1030, status="cancelled")
        assert find_doctor_conflict(conn, doctor_id, 1000, 1030) is None


def test_no_show_slot_is_free_for_rebooking():
    doctor_id, patient_id = _doctor_and_patient()
    with _db_conn() as conn:
        _seed_appointment(conn, doctor_id, patient_id, 1400, 1430, status="no_show")
        assert find_doctor_conflict(conn, doctor_id, 1400, 1430) is None


def test_conflict_ignores_different_doctor():
    doctor_id, patient_id = _doctor_and_patient()
    with _db_conn() as conn:
        other = conn.execute(
            "SELECT id FROM users WHERE email = ?", ("adi.n@sirkaya.health",)
        ).fetchone()[0]
        _seed_appointment(conn, doctor_id, patient_id, 1000, 1030)
        assert find_doctor_conflict(conn, other, 1000, 1030) is None


def test_appointment_end_falls_back_to_start_plus_duration():
    doctor_id, patient_id = _doctor_and_patient()
    with _db_conn() as conn:
        conn.execute(
            "INSERT INTO appointments (patient_id, doctor_id, scheduled_at, scheduled_end, "
            "duration_minutes, status, created_by, created_at, updated_at) "
            "VALUES (?, ?, 2000, NULL, 45, 'booked', NULL, 0, 0)",
            (patient_id, doctor_id),
        )
        row = conn.execute("SELECT * FROM appointments WHERE scheduled_at = 2000").fetchone()
        assert appointment_end(row) == 2000 + 45 * 60


# ---------------------------------------------------------------------------
# Payment status transitions (#22)
# ---------------------------------------------------------------------------


def test_payment_status_none_to_unpaid():
    assert compute_payment_status(0, 100.0) == "unpaid"


def test_payment_status_partial_payment():
    assert compute_payment_status(40.0, 100.0) == "partially_paid"
    assert compute_payment_status(99.99, 100.0) == "partially_paid"


def test_payment_status_full_payment():
    assert compute_payment_status(100.0, 100.0) == "paid"
    assert compute_payment_status(120.0, 100.0) == "paid"


def test_payment_status_void_stays_void():
    assert compute_payment_status(50.0, 100.0, current_status="void") == "void"
    assert compute_payment_status(0, 100.0, current_status="void") == "void"


# ---------------------------------------------------------------------------
# Invoice number generation (#22)
# ---------------------------------------------------------------------------


def test_invoice_number_starts_at_one():
    assert next_invoice_number([]) == f"INV-{2026}-0001"


def test_invoice_number_is_monotonic():
    numbers = ["INV-2026-0001", "INV-2026-0002", "INV-2026-0003"]
    assert next_invoice_number(numbers) == "INV-2026-0004"


def test_invoice_number_does_not_regress_after_deletion():
    # Highest issued number wins, even when lower rows were deleted.
    numbers = ["INV-2026-0012"]
    assert next_invoice_number(numbers) == "INV-2026-0013"
    assert next_invoice_number(["INV-2026-0009", "INV-2026-0012"]) == "INV-2026-0013"


def test_invoice_number_ignores_other_years():
    numbers = ["INV-2025-0009"]
    assert next_invoice_number(numbers) == "INV-2026-0001"


def test_invoice_number_ignores_garbage():
    assert next_invoice_number(["INV-2026-nope"]) == "INV-2026-0001"


# ---------------------------------------------------------------------------
# Permission dependency (RBAC)
# ---------------------------------------------------------------------------


def test_grant_create_implies_view():
    flags = grant({}, "can_create")
    assert flags["can_create"] is True
    assert flags["can_view"] is True


def test_grant_edit_implies_view():
    flags = grant({}, "can_edit")
    assert flags["can_edit"] is True
    assert flags["can_view"] is True


def test_grant_view_alone_leaves_writes_untouched():
    flags = grant({"can_create": True, "can_edit": True}, "can_view", value=False)
    assert flags["can_view"] is False
    assert flags["can_create"] is True


def test_revoke_view_revokes_all():
    flags = {
        "allowed": True,
        "can_view": True,
        "can_create": True,
        "can_edit": True,
        "can_delete": True,
    }
    revoked = revoke(flags, "can_view")
    assert revoked["can_view"] is False
    assert revoked["can_create"] is False
    assert revoked["can_edit"] is False
    assert revoked["can_delete"] is False


def test_revoke_single_write_keeps_view_and_others():
    flags = {"can_view": True, "can_create": True, "can_edit": True}
    revoked = revoke(flags, "can_create")
    assert revoked["can_create"] is False
    assert revoked["can_view"] is True
    assert revoked["can_edit"] is True


def test_consistency_check():
    assert is_consistent({"can_view": True, "can_create": True}) is True
    assert is_consistent({"can_view": False, "can_create": False}) is True
    assert is_consistent({"can_view": False, "can_create": True}) is False


# ---------------------------------------------------------------------------
# Widget lock resolution (#24)
# ---------------------------------------------------------------------------


def test_locked_widget_cannot_be_disabled():
    resolved = resolve_layout(
        [{"widget_id": 1, "position_order": 0, "enabled": False, "size": "medium"}],
        {1},
    )
    assert resolved[0]["enabled"] is True
    assert resolved[0]["position_order"] == 0


def test_omitted_locked_widget_is_re_added():
    resolved = resolve_layout(
        [{"widget_id": 2, "position_order": 0, "enabled": True, "size": "medium"}],
        {1, 2},
    )
    ids = [item["widget_id"] for item in resolved]
    assert 1 in ids
    locked = next(item for item in resolved if item["widget_id"] == 1)
    assert locked["enabled"] is True
    assert locked["position_order"] == 9999


def test_unlocked_widgets_pass_through():
    resolved = resolve_layout(
        [{"widget_id": 3, "position_order": 5, "enabled": False, "size": "small"}],
        {1},
    )
    passthrough = next(item for item in resolved if item["widget_id"] == 3)
    assert passthrough == {"widget_id": 3, "position_order": 5, "enabled": False, "size": "small"}


def test_locked_widget_keeps_admin_position_when_submitted():
    resolved = resolve_layout(
        [{"widget_id": 1, "position_order": 7, "enabled": True, "size": "large"}],
        {1},
    )
    assert resolved[0]["position_order"] == 7


def test_locked_widget_cannot_be_removed():
    assert can_remove(2, {2}) is False
    assert can_remove(3, {2}) is True


# ---------------------------------------------------------------------------
# Vitals plausibility
# ---------------------------------------------------------------------------


def test_vitals_within_range_are_plausible():
    reading = Reading(
        systolic=120, diastolic=80, heart_rate=72, spo2=98, temperature_c=36.8, respiratory_rate=16
    )
    assert is_plausible(reading)
    assert field_errors(reading) == []


def test_vitals_edge_values_are_plausible():
    assert is_plausible(Reading(systolic=50, diastolic=30, heart_rate=30, spo2=50))
    assert is_plausible(Reading(systolic=250, diastolic=150, heart_rate=220, spo2=100))


def test_vitals_out_of_range_are_flagged():
    errors = field_errors(Reading(systolic=45))
    assert any("systolic" in e for e in errors)
    errors = field_errors(Reading(diastolic=160))
    assert any("diastolic" in e for e in errors)
    errors = field_errors(Reading(heart_rate=240))
    assert any("heart_rate" in e for e in errors)


def test_vitals_partial_reading_is_plausible():
    assert is_plausible(Reading(systolic=118, diastolic=78))


# ---------------------------------------------------------------------------
# Care plan priority ordering
# ---------------------------------------------------------------------------


def test_care_plan_sorted_most_urgent_first():
    items = [
        {"id": 1, "priority": "normal", "description": "dressing change"},
        {"id": 2, "priority": "critical", "description": "airway watch"},
        {"id": 3, "priority": "high", "description": "meds"},
    ]
    ordered = sort_by_priority(items)
    assert [item["id"] for item in ordered] == [2, 3, 1]


def test_care_plan_unknown_priority_sorts_last():
    items = [
        {"id": 1, "priority": "high"},
        {"id": 2, "priority": "unknown"},
        {"id": 3, "priority": "normal"},
    ]
    ordered = sort_by_priority(items)
    assert ordered[-1]["id"] == 2


def test_care_plan_stable_within_priority():
    items = [
        {"id": 1, "priority": "normal"},
        {"id": 2, "priority": "normal"},
        {"id": 3, "priority": "low"},
    ]
    ordered = sort_by_priority(items)
    assert [item["id"] for item in ordered] == [1, 2, 3]


# ---------------------------------------------------------------------------
# Allergy contraindication matching (#21)
# ---------------------------------------------------------------------------


def test_penicillin_allergy_blocks_amoxicillin():
    block = match_contraindication(
        "Amoxicillin 500 mg",
        [RecordedAllergy(allergen="Penicillin", severity="severe")],
    )
    assert block is not None
    assert block["matched_medication_class"] == "amoxicillin 500 mg"
    assert block["allergens"][0]["allergen"] == "Penicillin"


def test_penicillin_allergy_blocks_penicillin_itself():
    block = match_contraindication(
        "Penicillin G",
        [RecordedAllergy(allergen="penicillin", severity="life_threatening")],
    )
    assert block is not None


def test_mild_allergy_does_not_block():
    block = match_contraindication(
        "Amoxicillin 500 mg",
        [RecordedAllergy(allergen="Penicillin", severity="mild")],
    )
    assert block is None


def test_unrelated_medication_is_not_blocked():
    block = match_contraindication(
        "Paracetamol 500 mg",
        [RecordedAllergy(allergen="Penicillin", severity="severe")],
    )
    assert block is None


def test_aspirin_expands_to_nsaid_class():
    block = match_contraindication(
        "Ibuprofen 400 mg",
        [RecordedAllergy(allergen="Aspirin", severity="severe")],
    )
    assert block is not None
