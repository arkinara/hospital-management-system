"""Tests for the medical records domain (ticket #21).

Minimal viable coverage — visit create/read, allergy block, prescription create/delete.
Other paths (sign-lock, attachments, cross-dept history) have more complex setup
that needs the post-#41 vitals/care-plan schema. We'll extend in a follow-up.
"""
from __future__ import annotations

import uuid

import pytest

from db.migrate import run_migrations
from db.seed import run_seed
from test_auth import _db_conn, bearer, client, login

ADMIN = ("admin@hospital.test", "Hospital2025!")
DOCTOR = ("doctor@hospital.test", "Hospital2025!")
NURSE = ("nurse@hospital.test", "Hospital2025!")
RECEPTIONIST = ("receptionist@hospital.test", "Hospital2025!")


def _admin_h():
    return bearer(login(*ADMIN)["access_token"])


def _doctor_h():
    return bearer(login(*DOCTOR)["access_token"])


def _nurse_h():
    return bearer(login(*NURSE)["access_token"])


def _recept_h():
    return bearer(login(*RECEPTIONIST)["access_token"])


def _patient_with_allergy(allergen: str = "penicillin", severity: str = "life_threatening"):
    headers = _admin_h()
    unique = uuid.uuid4().hex[:10]
    nat_id = f"3174{uuid.uuid4().int & 0xFFFFFFFFFFFF:012d}"
    r = client.post(
        "/patients",
        headers=headers,
        json={
            "national_id": nat_id,
            "full_name": f"Test Patient {unique}",
            "dob": "1990-01-01",
            "phone": f"081{uuid.uuid4().int & 0xFFFFFFF:07d}",
            "email": f"{unique}@test.local",
            "acuity": "standard",
            "admission_status": "outpatient",
        },
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    r2 = client.post(
        f"/patients/{pid}/allergies",
        headers=headers,
        json={"allergen": allergen, "severity": severity, "reaction": "anaphylaxis"},
    )
    assert r2.status_code == 201, r2.text
    return pid


def test_create_visit_returns_201_and_id():
    h = _doctor_h()
    pid = _patient_with_allergy("latex", "mild")
    r = client.post(
        "/medical-records/visits",
        headers=h,
        json={"patient_id": pid, "chief_complaint": "chest pain", "diagnosis": "stable angina"},
    )
    assert r.status_code == 201, r.text
    assert "id" in r.json()
    assert r.json()["diagnosis"] == "stable angina"


def test_get_visit_returns_record_with_rx_and_attachments():
    h = _doctor_h()
    pid = _patient_with_allergy("latex", "mild")
    r = client.post(
        "/medical-records/visits", headers=h,
        json={"patient_id": pid, "chief_complaint": "x", "diagnosis": "y"},
    )
    vid = r.json()["id"]
    r2 = client.get(f"/medical-records/visits/{vid}", headers=h)
    assert r2.status_code == 200
    assert r2.json()["visit"]["id"] == vid
    assert "prescriptions" in r2.json()
    assert "attachments" in r2.json()


def test_list_patient_visits_returns_array():
    h = _doctor_h()
    pid = _patient_with_allergy("latex", "mild")
    client.post("/medical-records/visits", headers=h, json={"patient_id": pid, "diagnosis": "first"})
    client.post("/medical-records/visits", headers=h, json={"patient_id": pid, "diagnosis": "second"})
    r = client.get(f"/medical-records/patients/{pid}/visits", headers=h)
    assert r.status_code == 200
    assert r.json()["total"] >= 2
    assert isinstance(r.json()["visits"], list)


def test_allergy_block_on_prescription():
    h = _doctor_h()
    pid = _patient_with_allergy("penicillin", "severe")
    vr = client.post(
        "/medical-records/visits", headers=h,
        json={"patient_id": pid, "chief_complaint": "infection"},
    )
    vid = vr.json()["id"]
    pr = client.post(
        f"/medical-records/visits/{vid}/prescriptions",
        headers=h,
        json={"medication": "Amoxicillin", "dosage": "500mg", "frequency": "TID"},
    )
    assert pr.status_code == 422, pr.text
    body = pr.json()
    # The app wraps all HTTPExceptions in a generic envelope; we know allergy
    # blocks are 422. Inspect response shape — accept either the generic envelope
    # OR a structured detail with our code.
    err = body.get("error", body)
    assert err.get("code") in ("http_422", "allergy_contraindication")


def test_prescription_create_then_delete():
    h = _doctor_h()
    pid = _patient_with_allergy("latex", "severe")
    vr = client.post(
        "/medical-records/visits", headers=h,
        json={"patient_id": pid, "chief_complaint": "headache"},
    )
    vid = vr.json()["id"]
    pr = client.post(
        f"/medical-records/visits/{vid}/prescriptions",
        headers=h,
        json={"medication": "Paracetamol", "dosage": "500mg", "frequency": "PRN"},
    )
    assert pr.status_code == 201
    rxid = pr.json()["id"]
    dr = client.delete(f"/medical-records/prescriptions/{rxid}", headers=h)
    assert dr.status_code == 204


def test_rbac_receptionist_cannot_create_visit():
    h = _recept_h()
    pid = _patient_with_allergy("latex", "mild")
    r = client.post(
        "/medical-records/visits", headers=h,
        json={"patient_id": pid, "chief_complaint": "x"},
    )
    assert r.status_code == 403


def test_nurse_can_read_visits_but_not_create():
    h = _nurse_h()
    pid = _patient_with_allergy("latex", "mild")
    dh = _doctor_h()
    vr = client.post(
        "/medical-records/visits", headers=dh,
        json={"patient_id": pid, "chief_complaint": "x"},
    )
    vid = vr.json()["id"]
    r = client.get(f"/medical-records/visits/{vid}", headers=h)
    assert r.status_code == 200
    cr = client.post(
        "/medical-records/visits", headers=h,
        json={"patient_id": pid, "chief_complaint": "x"},
    )
    assert cr.status_code == 403