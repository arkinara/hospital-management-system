"""Tests for the patient domain (#19): CRUD, dedup detection, search, timeline,
allergies, RBAC and audit logging.

Uses an isolated SQLite file (migrated + seeded) so it never touches the dev
database — same pattern as test_auth.py.
"""

from __future__ import annotations

import os
import pathlib
import sqlite3
import sys
import uuid

_SHARED_TEST_DB = pathlib.Path("/tmp/hospital-test-shared.db").resolve()
os.environ["DATABASE_PATH"] = str(_SHARED_TEST_DB)
os.environ["JWT_SECRET"] = "test-secret"

sys.path = [str(pathlib.Path(__file__).resolve().parents[1])] + sys.path

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

_db_path = _SHARED_TEST_DB
client = TestClient(app)

ADMIN = ("admin@hospital.test", "Hospital2025!")
DOCTOR = ("doctor@hospital.test", "Hospital2025!")
RECEPTIONIST = ("receptionist@hospital.test", "Hospital2025!")

def make_patient(**overrides) -> dict:
    """Build a unique, dedup-clean patient payload.

    Every generated record gets a random name, DOB, phone and national_id so
    tests never trip the fuzzy matcher against the seeded fixture patients or
    against rows left behind by other tests.
    """
    token = uuid.uuid4().hex[:8]
    base = {
        "full_name": f"Test Patient {token}",
        "dob": f"1980-{(uuid.uuid4().int % 12) + 1:02d}-{(uuid.uuid4().int % 28) + 1:02d}",
        "phone": f"+62 811 {uuid.uuid4().int % 10_000_000:07d}",
        "national_id": f"3174{uuid.uuid4().int % 10**12:012d}",
        "sex": "m",
        "acuity": "standard",
        "admission_status": "outpatient",
    }
    base.update(overrides)
    return base


def login(email: str, password: str) -> dict:
    resp = client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def headers(role: str, extra: dict | None = None) -> dict:
    creds = {"admin": ADMIN, "doctor": DOCTOR, "receptionist": RECEPTIONIST}[role]
    out = bearer(login(*creds)["access_token"])
    if extra:
        out.update(extra)
    return out


def patient_id_for_mrn(mrn: str) -> int:
    with sqlite3.connect(_db_path) as conn:
        return conn.execute("SELECT id FROM patients WHERE mrn = ?", (mrn,)).fetchone()[0]


def audit_actions(since_id: int) -> list[str]:
    with sqlite3.connect(_db_path) as conn:
        return [
            r[0]
            for r in conn.execute(
                "SELECT action FROM audit_log WHERE id > ? ORDER BY id", (since_id,)
            ).fetchall()
        ]


def max_audit_id() -> int:
    with sqlite3.connect(_db_path) as conn:
        return conn.execute("SELECT COALESCE(MAX(id), 0) FROM audit_log").fetchone()[0]


# ---- CRUD ------------------------------------------------------------------


def test_admin_create_patient_returns_201_with_id_and_mrn():
    before = max_audit_id()
    name = f"John Smith {uuid.uuid4().hex[:6]}"
    resp = client.post("/patients", headers=headers("admin"), json=make_patient(full_name=name))
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["id"]
    assert body["mrn"].startswith("MRN-")
    assert body["full_name"] == name
    assert body["admission_status"] == "outpatient"
    assert "patient.create" in audit_actions(before)


def test_get_patient_returns_full_record_with_allergies_and_departments():
    created = client.post("/patients", headers=headers("admin"), json=make_patient()).json()
    resp = client.get(f"/patients/{created['id']}", headers=headers("admin"))
    assert resp.status_code == 200
    body = resp.json()
    assert body["full_name"] == created["full_name"]
    assert "allergies" in body and isinstance(body["allergies"], list)
    assert "departments" in body and isinstance(body["departments"], list)


def test_patch_patient_updates_and_audits():
    created = client.post("/patients", headers=headers("admin"), json=make_patient()).json()
    before = max_audit_id()
    resp = client.patch(
        f"/patients/{created['id']}",
        headers=headers("admin"),
        json={"phone": "+62 812 000 2222", "acuity": "urgent"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["phone"] == "+62 812 000 2222"
    assert body["acuity"] == "urgent"
    assert "patient.update" in audit_actions(before)


def test_get_unknown_patient_is_404():
    assert client.get("/patients/999999", headers=headers("admin")).status_code == 404


def test_create_missing_required_field_is_422():
    resp = client.post("/patients", headers=headers("admin"), json={"full_name": "No Dob"})
    assert resp.status_code == 422


def test_create_malformed_national_id_is_422():
    resp = client.post(
        "/patients",
        headers=headers("admin"),
        json=make_patient(national_id="abc-123"),
    )
    assert resp.status_code == 422


# ---- Dedup ------------------------------------------------------------------


def test_same_national_id_is_409_with_existing_patient():
    first = make_patient()
    created = client.post("/patients", headers=headers("admin"), json=first).json()
    before = max_audit_id()
    resp = client.post(
        "/patients",
        headers=headers("admin"),
        json=make_patient(national_id=first["national_id"], full_name="Jane Different"),
    )
    assert resp.status_code == 409
    body = resp.json()
    assert body["match_type"] == "national_id"
    assert body["existing"]["id"] == created["id"]
    assert any(a.startswith("patient.dedup") for a in audit_actions(before))


def test_fuzzy_name_dob_match_is_409_with_candidates():
    token = uuid.uuid4().hex[:6]
    first = make_patient(full_name=f"Michael Johnson {token}")
    created = client.post("/patients", headers=headers("admin"), json=first).json()
    resp = client.post(
        "/patients",
        headers=headers("admin"),
        json=make_patient(full_name=f"Michael Johnsen {token}", dob=first["dob"]),
    )
    assert resp.status_code == 409
    body = resp.json()
    assert body["match_type"] == "fuzzy_name_dob"
    candidates = body["suspects"]
    assert any(c["patient_id"] == created["id"] for c in candidates)
    assert all(c["similarity"] > 0.85 for c in candidates)


def test_dedup_check_endpoint_returns_suspects():
    first = make_patient()
    client.post("/patients", headers=headers("admin"), json=first)
    resp = client.post(
        "/patients/dedup-check",
        headers=headers("admin"),
        json={"national_id": first["national_id"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["suspects"]) >= 1
    assert body["suspects"][0]["match_type"] == "national_id"


def test_admin_override_dedup_returns_201_and_audits():
    first = make_patient()
    client.post("/patients", headers=headers("admin"), json=first)
    before = max_audit_id()
    resp = client.post(
        "/patients",
        headers=headers("admin", {"X-Override-Dedup": "Known false positive, same household"}),
        json=make_patient(full_name=f"John Smyth {uuid.uuid4().hex[:6]}", dob=first["dob"]),
    )
    assert resp.status_code == 201, resp.text
    assert "patient.dedup_override" in audit_actions(before)
    assert "patient.create" in audit_actions(before)


def test_override_header_not_allowed_for_non_admin():
    name = f"John Johnson {uuid.uuid4().hex[:6]}"
    first = make_patient(full_name=name)
    client.post("/patients", headers=headers("admin"), json=first)
    resp = client.post(
        "/patients",
        headers=headers("receptionist", {"X-Override-Dedup": "should be denied"}),
        json=make_patient(full_name=name, dob=first["dob"]),
    )
    assert resp.status_code == 403


def test_low_similarity_does_not_block():
    client.post(
        "/patients",
        headers=headers("admin"),
        json=make_patient(full_name=f"Robert Downey {uuid.uuid4().hex[:6]}"),
    )
    resp = client.post(
        "/patients",
        headers=headers("admin"),
        json=make_patient(full_name=f"Alice Wonder {uuid.uuid4().hex[:6]}"),
    )
    assert resp.status_code == 201


# ---- RBAC -------------------------------------------------------------------


def test_doctor_can_read_but_not_write():
    assert client.get("/patients", headers=headers("doctor")).status_code == 200
    resp = client.post("/patients", headers=headers("doctor"), json=make_patient())
    assert resp.status_code == 403
    created = client.post("/patients", headers=headers("admin"), json=make_patient()).json()
    patched = client.patch(
        f"/patients/{created['id']}", headers=headers("doctor"), json={"phone": "x"}
    )
    assert patched.status_code == 403


def test_receptionist_can_create_and_read_but_not_delete():
    created = client.post("/patients", headers=headers("receptionist"), json=make_patient())
    assert created.status_code == 201
    pid = created.json()["id"]
    assert client.get(f"/patients/{pid}", headers=headers("receptionist")).status_code == 200
    allergy = client.post(
        f"/patients/{pid}/allergies",
        headers=headers("receptionist"),
        json={"allergen": "Penicillin", "severity": "severe"},
    )
    assert allergy.status_code == 201
    allergy_id = allergy.json()["id"]
    # Receptionist cannot remove an allergy (admin only).
    removed = client.delete(
        f"/patients/{pid}/allergies/{allergy_id}", headers=headers("receptionist")
    )
    assert removed.status_code == 403


def test_doctor_cannot_access_timeline_of_unknown_patient_404():
    assert client.get("/patients/999999/timeline", headers=headers("doctor")).status_code == 404


# ---- Search ------------------------------------------------------------------


def test_search_by_name_returns_paginated_results():
    token = uuid.uuid4().hex[:6]
    for name in (f"John Adams {token}", f"John Baker {token}", f"John Carter {token}"):
        client.post("/patients", headers=headers("admin"), json=make_patient(full_name=name))
    resp = client.get("/patients?query=john&page=1&page_size=2", headers=headers("admin"))
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 3
    assert len(body["patients"]) == 2
    assert all("john" in p["full_name"].lower() for p in body["patients"])
    assert body["page"] == 1


def test_search_pagination_caps_at_100():
    resp = client.get("/patients?page_size=500", headers=headers("admin"))
    assert resp.status_code == 200
    body = resp.json()
    assert body["page_size"] == 100
    assert len(body["patients"]) <= 100


def test_search_no_matches_returns_empty_200():
    resp = client.get("/patients?query=zzzzzznobody", headers=headers("admin"))
    assert resp.status_code == 200
    body = resp.json()
    assert body["patients"] == []
    assert body["total"] == 0


def test_list_filter_by_acuity_and_admission_status():
    resp = client.get(
        "/patients?acuity=critical&admission_status=admitted", headers=headers("admin")
    )
    assert resp.status_code == 200
    for p in resp.json()["patients"]:
        assert p["acuity"] == "critical"
        assert p["admission_status"] == "admitted"


# ---- Timeline ----------------------------------------------------------------


def test_timeline_aggregates_cross_department_events():
    pid = patient_id_for_mrn("P-001042")  # has CAR + GEN visits in the seed
    resp = client.get(f"/patients/{pid}/timeline", headers=headers("admin"))
    assert resp.status_code == 200
    events = resp.json()["timeline"]
    assert isinstance(events, list)
    assert len(events) > 0
    kinds = {e["kind"] for e in events}
    assert "visit" in kinds or "prescription" in kinds or "vitals" in kinds
    departments = {e["department"] for e in events if e.get("department")}
    assert len(departments) >= 2, f"expected cross-department events, got {departments}"


def test_timeline_new_patient_is_empty_array():
    created = client.post("/patients", headers=headers("admin"), json=make_patient()).json()
    resp = client.get(f"/patients/{created['id']}/timeline", headers=headers("admin"))
    assert resp.status_code == 200
    assert resp.json()["timeline"] == []


# ---- Allergies ---------------------------------------------------------------


def test_allergy_add_returns_201_object_and_audits():
    created = client.post("/patients", headers=headers("admin"), json=make_patient()).json()
    before = max_audit_id()
    resp = client.post(
        f"/patients/{created['id']}/allergies",
        headers=headers("admin"),
        json={"allergen": "Amoxicillin", "severity": "life_threatening", "reaction": "Anaphylaxis"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["allergen"] == "Amoxicillin"
    assert body["severity"] == "life_threatening"
    assert body["patient_id"] == created["id"]
    assert "patient.allergy_add" in audit_actions(before)

    detail = client.get(f"/patients/{created['id']}", headers=headers("admin")).json()
    assert any(a["allergen"] == "Amoxicillin" for a in detail["allergies"])

    resp = client.delete(
        f"/patients/{created['id']}/allergies/{body['id']}", headers=headers("admin")
    )
    assert resp.status_code == 204
    assert "patient.allergy_remove" in audit_actions(before)


def test_allergy_delete_unknown_is_404():
    assert (
        client.delete("/patients/999999/allergies/999", headers=headers("admin")).status_code
        == 404
    )


# ---- Auth required -----------------------------------------------------------


def test_patient_endpoints_require_auth():
    assert client.get("/patients").status_code == 401
    assert client.post("/patients", json=make_patient()).status_code == 401
    assert client.get("/patients/1/timeline").status_code == 401
