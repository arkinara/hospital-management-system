"""Ticket #40 — clinical attributes + contraindication check.

Tests the clinical-summary surface, acuity/admission filters + acuity sort,
allergy register round-trips, and the server-side allergy guard that blocks
both prescription create AND visit-note sign.
"""

from __future__ import annotations

import uuid

from test_auth import _db_conn, bearer, client, login

ADMIN = ("admin@hospital.test", "Hospital2025!")
DOCTOR = ("doctor@hospital.test", "Hospital2025!")
RECEPTIONIST = ("receptionist@hospital.test", "Hospital2025!")


def _headers(creds):
    return bearer(login(*creds)["access_token"])


def _make_patient(acuity="standard", admission_status="outpatient", dept_id=None):
    unique = uuid.uuid4().hex[:8]
    r = client.post(
        "/patients",
        headers=_headers(ADMIN),
        json={
            "full_name": f"Clinical {unique}",
            "dob": "1991-03-15",
            "phone": f"0812{uuid.uuid4().int & 0xFFFFFF:06d}",
            "national_id": f"88{uuid.uuid4().int & 0xFFFFFFFFFFFF:012d}",
            "sex": "f",
            "acuity": acuity,
            "admission_status": admission_status,
            "primary_department_id": dept_id,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _add_allergy(pid, allergen, severity="severe"):
    r = client.post(
        f"/patients/{pid}/allergies",
        headers=_headers(RECEPTIONIST),
        json={"allergen": allergen, "severity": severity, "reaction": "anaphylaxis"},
    )
    assert r.status_code == 201, r.text
    return r.json()


# ---- Clinical summary ------------------------------------------------------


def test_clinical_summary_returns_safety_attributes_and_counts():
    pid = _make_patient(acuity="critical", admission_status="admitted")
    _add_allergy(pid, "Penicillin", severity="life_threatening")
    summary = client.get(f"/patients/{pid}/clinical-summary", headers=_headers(DOCTOR))
    assert summary.status_code == 200, summary.text
    body = summary.json()
    assert body["id"] == pid
    assert body["acuity"] == "critical"
    assert body["admission_status"] == "admitted"
    assert body["is_active"] is True
    assert isinstance(body["allergies"], list)
    assert any(a["allergen"] == "Penicillin" for a in body["allergies"])
    assert body["active_prescriptions_count"] == 0
    assert body["active_appointments_count"] == 0


def test_clinical_summary_counts_prescriptions_and_appointments():
    pid = _make_patient()
    with _db_conn() as conn:
        doctor_id = conn.execute(
            "SELECT id FROM users WHERE email = ?", (DOCTOR[0],)
        ).fetchone()[0]
        visit = conn.execute(
            "INSERT INTO visit_notes (patient_id, doctor_id, diagnosis, status, created_at) "
            "VALUES (?, ?, 'sum', 'signed', 0)",
            (pid, doctor_id),
        )
        vid = visit.lastrowid
        conn.execute(
            "INSERT INTO prescriptions (visit_note_id, medication, dosage, frequency, "
            "duration_days, created_at) VALUES (?, 'Paracetamol', '500 mg', 'TID', 5, 0)",
            (vid,),
        )
    summary = client.get(f"/patients/{pid}/clinical-summary", headers=_headers(DOCTOR))
    assert summary.json()["active_prescriptions_count"] == 1


def test_clinical_summary_unknown_patient_is_404():
    r = client.get("/patients/999999/clinical-summary", headers=_headers(DOCTOR))
    assert r.status_code == 404


# ---- Acuity / admission filters + sort -------------------------------------


def test_patient_filter_acuity_and_admission_status():
    pid = _make_patient(acuity="critical", admission_status="admitted")
    listing = client.get(
        "/patients",
        params={"acuity": "critical", "admission_status": "admitted", "page_size": 100},
        headers=_headers(DOCTOR),
    )
    assert listing.status_code == 200
    ids = [p["id"] for p in listing.json()["patients"]]
    assert pid in ids
    for p in listing.json()["patients"]:
        assert p["acuity"] == "critical"
        assert p["admission_status"] == "admitted"


def test_patient_filter_acuity_alone():
    _make_patient(acuity="critical")
    listing = client.get(
        "/patients", params={"acuity": "critical", "page_size": 100},
        headers=_headers(DOCTOR),
    )
    assert listing.status_code == 200
    assert all(p["acuity"] == "critical" for p in listing.json()["patients"])


def test_patient_sort_by_acuity_ranks_critical_first():
    _make_patient(acuity="routine")
    _make_patient(acuity="critical")
    listing = client.get(
        "/patients", params={"sort": "acuity", "page_size": 100},
        headers=_headers(DOCTOR),
    )
    assert listing.status_code == 200
    patients = listing.json()["patients"]
    rank = {"critical": 0, "urgent": 1, "standard": 2, "routine": 3}
    ordered = [rank[p["acuity"]] for p in patients]
    assert ordered == sorted(ordered)


# ---- Allergy register + contraindication -----------------------------------


def test_add_allergy_returns_it_on_the_payload():
    pid = _make_patient()
    allergy = _add_allergy(pid, "Amoxicillin", severity="severe")
    assert allergy["patient_id"] == pid
    assert allergy["allergen"] == "Amoxicillin"
    assert allergy["severity"] == "severe"
    assert allergy["noted_by"] is not None
    assert allergy["noted_at"] is not None


def test_add_allergy_empty_allergen_is_422():
    pid = _make_patient()
    r = client.post(
        f"/patients/{pid}/allergies",
        headers=_headers(RECEPTIONIST),
        json={"allergen": "", "severity": "mild"},
    )
    assert r.status_code == 422


def test_acuity_update_persists_and_is_attributable():
    pid = _make_patient(acuity="routine")
    r = client.patch(
        f"/patients/{pid}",
        headers=_headers(RECEPTIONIST),
        json={"acuity": "critical"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["acuity"] == "critical"
    with _db_conn() as conn:
        rows = conn.execute(
            "SELECT action FROM audit_log WHERE entity_type = 'patient' AND entity_id = ?",
            (str(pid),),
        ).fetchall()
    assert any(row["action"] == "patient.update" for row in rows)


def test_acuity_update_invalid_value_is_422_without_mutation():
    pid = _make_patient(acuity="routine")
    r = client.patch(
        f"/patients/{pid}", headers=_headers(RECEPTIONIST), json={"acuity": "super"}
    )
    assert r.status_code == 422
    with _db_conn() as conn:
        row = conn.execute("SELECT acuity FROM patients WHERE id = ?", (pid,)).fetchone()
    assert row["acuity"] == "routine"


def test_patient_default_acuity_is_routine():
    r = client.post(
        "/patients",
        headers=_headers(ADMIN),
        json={
            "full_name": f"Default Acuity {uuid.uuid4().hex[:6]}",
            "dob": "1992-01-01",
            "phone": "08129990001",
            "national_id": f"99{uuid.uuid4().int & 0xFFFFFFFFFFFF:012d}",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["acuity"] == "routine"


# ---- Sign-flow contraindication --------------------------------------------


def test_penicillin_allergy_blocks_amoxicillin_at_create():
    pid = _make_patient()
    _add_allergy(pid, "Penicillin", severity="severe")
    visit = client.post(
        "/medical-records/visits",
        headers=_headers(DOCTOR),
        json={"patient_id": pid, "diagnosis": "infection"},
    )
    vid = visit.json()["id"]
    r = client.post(
        f"/medical-records/visits/{vid}/prescriptions",
        headers=_headers(DOCTOR),
        json={"medication": "Amoxicillin", "dosage": "500 mg", "frequency": "TID"},
    )
    assert r.status_code == 422, r.text
    err = r.json().get("error", r.json())
    assert err.get("code") in ("http_422", "allergy_contraindication")


def test_penicillin_allergy_blocks_visit_sign_with_409():
    pid = _make_patient()
    visit = client.post(
        "/medical-records/visits",
        headers=_headers(DOCTOR),
        json={"patient_id": pid, "diagnosis": "otitis media"},
    )
    vid = visit.json()["id"]
    # Prescription is safe to create BEFORE the allergy is on file.
    rx = client.post(
        f"/medical-records/visits/{vid}/prescriptions",
        headers=_headers(DOCTOR),
        json={"medication": "Amoxicillin", "dosage": "500 mg", "frequency": "TID"},
    )
    assert rx.status_code == 201, rx.text
    # Now the allergy lands and blocks signing server-side.
    _add_allergy(pid, "Penicillin", severity="life_threatening")
    r = client.post(
        f"/medical-records/visits/{vid}/sign",
        headers=_headers(DOCTOR),
        json={"password_confirmation": "Hospital2025!"},
    )
    assert r.status_code == 409, r.text
    err = r.json().get("error", r.json())
    assert err.get("code") in ("http_409", "allergy_contraindication")
    clashes = r.json().get("prescriptions") or (err.get("prescriptions") or [])
    assert clashes, "the clashing prescription must be surfaced"
    with _db_conn() as conn:
        row = conn.execute("SELECT signed_at FROM visit_notes WHERE id = ?", (vid,)).fetchone()
    assert row["signed_at"] is None, "the visit must NOT be signed"


def test_visit_sign_succeeds_without_contraindication():
    pid = _make_patient()
    _add_allergy(pid, "Latex", severity="mild")
    visit = client.post(
        "/medical-records/visits",
        headers=_headers(DOCTOR),
        json={"patient_id": pid, "diagnosis": "routine check"},
    )
    vid = visit.json()["id"]
    rx = client.post(
        f"/medical-records/visits/{vid}/prescriptions",
        headers=_headers(DOCTOR),
        json={"medication": "Paracetamol", "dosage": "500 mg", "frequency": "PRN"},
    )
    assert rx.status_code == 201
    r = client.post(
        f"/medical-records/visits/{vid}/sign",
        headers=_headers(DOCTOR),
        json={"password_confirmation": "Hospital2025!"},
    )
    assert r.status_code == 204, r.text