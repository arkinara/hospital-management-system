"""RBAC matrix integration test (ticket #55).

For every endpoint × every role (admin / doctor / nurse / receptionist / anon)
assert the authz gate:

- an allowed role reaches the endpoint logic: response is never 401/403/500,
- a denied role gets a hard 403 (the endpoint enforces even when the frontend
  would have hidden the action — the "hidden nav" case),
- anonymous gets 401/403 and never 500.

An endpoint missing its RBAC check fails its denied-role assertion instead of
passing on a happy path.

The manifest resolves real seeded ids per run; resources the manifest reads
back (appointment, visit, invoice, claim, disposable user) are created once per
test against the fresh migrated + seeded DB the conftest autouse fixture
provides.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

from test_auth import _db_conn, bearer, client, login

ADMIN = ("admin@hospital.test", "Hospital2025!")
DOCTOR = ("doctor@hospital.test", "Hospital2025!")
NURSE = ("nurse@hospital.test", "Hospital2025!")
RECEPTIONIST = ("receptionist@hospital.test", "Hospital2025!")

ROLES = ["admin", "doctor", "nurse", "receptionist"]

ALL = {"admin", "doctor", "nurse", "receptionist"}
ADMIN_ONLY = {"admin"}
PATIENT_WRITE = {"admin", "receptionist"}
DOCTOR_ADMIN = {"admin", "doctor"}
DOCTOR_NURSE_ADMIN = {"admin", "doctor", "nurse"}
RECORDS_READ = {"admin", "doctor", "nurse"}  # receptionist has no records access
BILLING_ROLES = {"admin", "receptionist"}
SELF_AVAILABILITY = {"admin", "doctor"}  # doctor writes own availability only


def _headers(role: str) -> dict:
    creds = {
        "admin": ADMIN,
        "doctor": DOCTOR,
        "nurse": NURSE,
        "receptionist": RECEPTIONIST,
    }[role]
    return bearer(login(*creds)["access_token"])


def _resolve_ids() -> dict:
    with _db_conn() as conn:
        return {
            "doctor_id": conn.execute(
                "SELECT id FROM users WHERE email = ?", (DOCTOR[0],)
            ).fetchone()[0],
            "admin_id": conn.execute(
                "SELECT id FROM users WHERE email = ?", (ADMIN[0],)
            ).fetchone()[0],
            "nurse_id": conn.execute(
                "SELECT id FROM users WHERE email = ?", (NURSE[0],)
            ).fetchone()[0],
            "patient_id": conn.execute("SELECT id FROM patients ORDER BY id LIMIT 1").fetchone()[0],
            "dept_gen": conn.execute("SELECT id FROM departments WHERE code = 'GEN'").fetchone()[0],
            "dept_car": conn.execute("SELECT id FROM departments WHERE code = 'CAR'").fetchone()[0],
        }


def _create_resources(ids: dict) -> dict:
    """Create the rows the manifest reads back (appointment, visit, invoice,
    claim) and a disposable user the admin-only patch/deactivate cases can
    mutate without touching the seeded admin account."""
    doctor_id = ids["doctor_id"]
    patient_id = ids["patient_id"]
    dept_gen = ids["dept_gen"]
    start = int((datetime.now(UTC) + timedelta(days=2)).replace(hour=10, minute=0).timestamp())
    with _db_conn() as conn:
        appt = conn.execute(
            "INSERT INTO appointments (patient_id, doctor_id, department_id, scheduled_at, "
            "scheduled_end, duration_minutes, status, created_by, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, 30, 'booked', ?, ?, ?)",
            (patient_id, doctor_id, dept_gen, start, start + 1800, ids["admin_id"], start, start),
        )
        ids["appointment_id"] = appt.lastrowid

    patch = client.post(
        "/auth/users",
        headers=_headers("admin"),
        json={
            "email": "rbac.patch@hospital.test",
            "password": "Hospital2025!",
            "full_name": "RBAC Patch Target",
            "role": "receptionist",
        },
    )
    ids["patch_user_id"] = patch.json()["id"]

    visit = client.post(
        "/medical-records/visits",
        headers=_headers("doctor"),
        json={"patient_id": patient_id, "diagnosis": "RBAC probe diagnosis", "status": "draft"},
    )
    ids["visit_id"] = visit.json()["id"]

    inv = client.post(
        "/billing/invoices",
        headers=_headers("receptionist"),
        json={
            "patient_id": patient_id,
            "line_items": [
                {"code": "X1", "description": "Consultation", "quantity": 1, "unit_amount": 100}
            ],
        },
    )
    ids["invoice_id"] = inv.json()["id"]
    claim = client.post(
        f"/billing/invoices/{ids['invoice_id']}/claim",
        headers=_headers("receptionist"),
        json={"payer_name": "RBAC Payer", "claim_number": "RBAC-1"},
    )
    ids["claim_id"] = claim.json()["id"]
    return ids


# Manifest: (method, path, body | None, allowed roles, kind)
#   kind "": JSON request; kind "multipart": multipart file upload.
# Paths/bodies reference ids as "{...}" placeholders resolved at runtime.
CASES: list[tuple[str, str, object | None, set[str], str]] = [
    # ---- Auth / admin account management --------------------------------
    ("GET", "/auth/me", None, ALL, ""),
    (
        "POST",
        "/auth/change-password",
        {"current_password": "Hospital2025!", "new_password": "Hospital2025!"},
        ALL,
        "",
    ),
    ("GET", "/auth/permissions", None, ADMIN_ONLY, ""),
    ("PUT", "/auth/permissions/receptionist/billing", {"allowed": True}, ADMIN_ONLY, ""),
    ("GET", "/auth/users", None, ADMIN_ONLY, ""),
    (
        "POST",
        "/auth/users",
        {
            "email": "rbac.user@hospital.test",
            "password": "Hospital2025!",
            "full_name": "RBAC User",
            "role": "receptionist",
        },
        ADMIN_ONLY,
        "",
    ),
    ("PATCH", "/auth/users/{patch_user_id}", {"role": "doctor"}, ADMIN_ONLY, ""),
    ("POST", "/auth/users/{patch_user_id}/deactivate", None, ADMIN_ONLY, ""),
    # ---- Patients -------------------------------------------------------
    ("GET", "/patients", None, ALL, ""),
    (
        "POST",
        "/patients/dedup-check",
        {"full_name": "Nonexistent Person", "dob": "1990-01-01"},
        ALL,
        "",
    ),
    ("GET", "/patients/{patient_id}", None, ALL, ""),
    (
        "POST",
        "/patients",
        {
            "full_name": "RBAC Patient",
            "dob": "1992-02-02",
            "phone": "0811",
            "national_id": "7788778877",
            "sex": "f",
            "acuity": "standard",
            "admission_status": "outpatient",
        },
        PATIENT_WRITE,
        "",
    ),
    ("PATCH", "/patients/{patient_id}", {"full_name": "Renamed RBAC Patient"}, PATIENT_WRITE, ""),
    (
        "POST",
        "/patients/{patient_id}/allergies",
        {"allergen": "Iodine", "severity": "moderate"},
        PATIENT_WRITE,
        "",
    ),
    ("DELETE", "/patients/{patient_id}/allergies/{allergy_id}", None, ADMIN_ONLY, ""),
    ("GET", "/patients/{patient_id}/timeline", None, ALL, ""),
    ("GET", "/patients/{patient_id}/clinical-summary", None, ALL, ""),
    # ---- Appointments ---------------------------------------------------
    ("GET", "/appointments", None, ALL, ""),
    ("GET", "/appointments/{appointment_id}", None, ALL, ""),
    (
        "POST",
        "/appointments",
        {
            "patient_id": "{patient_id}",
            "doctor_id": "{doctor_id}",
            "department_id": "{dept_car}",
            "scheduled_start": "{start_iso}",
            "reason": "RBAC booking",
        },
        ALL,
        "",
    ),
    ("PATCH", "/appointments/{appointment_id}", {"reason": "RBAC updated"}, ALL, ""),
    ("POST", "/appointments/{appointment_id}/check-in", None, ALL, ""),
    ("POST", "/appointments/{appointment_id}/start", None, ALL, ""),
    ("POST", "/appointments/{appointment_id}/complete", None, ALL, ""),
    ("POST", "/appointments/{appointment_id}/cancel", {"reason": "RBAC"}, ALL, ""),
    ("POST", "/appointments/{appointment_id}/no-show", {"reason": "RBAC"}, ALL, ""),
    ("GET", "/appointments/wait-time-stats", None, ADMIN_ONLY, ""),
    ("GET", "/doctors/{doctor_id}/schedule", None, ALL, ""),
    ("GET", "/doctors/{doctor_id}/availability", None, ALL, ""),
    (
        "PUT",
        "/doctors/{doctor_id}/availability",
        {"windows": [{"day_of_week": 0, "start_time": "08:00", "end_time": "17:00"}]},
        SELF_AVAILABILITY,
        "",
    ),
    (
        "POST",
        "/doctors/{doctor_id}/blocked-days",
        {"blocked_date": "{blocked_date}", "reason": "RBAC block"},
        SELF_AVAILABILITY,
        "",
    ),
    ("DELETE", "/doctors/{doctor_id}/blocked-days/{blocked_id}", None, SELF_AVAILABILITY, ""),
    # ---- Medical records ------------------------------------------------
    ("GET", "/medical-records/patients/{patient_id}/visits", None, RECORDS_READ, ""),
    ("GET", "/medical-records/visits/{visit_id}", None, RECORDS_READ, ""),
    (
        "POST",
        "/medical-records/visits",
        {"patient_id": "{patient_id}", "diagnosis": "RBAC visit"},
        DOCTOR_ADMIN,
        "",
    ),
    ("PATCH", "/medical-records/visits/{visit_id}", {"diagnosis": "RBAC edited"}, DOCTOR_ADMIN, ""),
    (
        "POST",
        "/medical-records/visits/{visit_id}/sign",
        {"password_confirmation": "Hospital2025!"},
        DOCTOR_ADMIN,
        "",
    ),
    (
        "POST",
        "/medical-records/visits/{visit_id}/prescriptions",
        {"medication": "Paracetamol", "dosage": "500 mg", "frequency": "1x/day"},
        DOCTOR_ADMIN,
        "",
    ),
    ("GET", "/medical-records/prescriptions/{rx_id}", None, RECORDS_READ, ""),
    ("DELETE", "/medical-records/prescriptions/{rx_id}", None, DOCTOR_ADMIN, ""),
    ("GET", "/medical-records/patients/{patient_id}/history", None, RECORDS_READ, ""),
    (
        "POST",
        "/medical-records/patients/{patient_id}/vitals",
        {
            "systolic": 120,
            "diastolic": 80,
            "heart_rate": 72,
            "spo2": 98,
            "temperature_c": 36.8,
            "respiratory_rate": 16,
        },
        DOCTOR_NURSE_ADMIN,
        "",
    ),
    ("GET", "/medical-records/patients/{patient_id}/vitals", None, RECORDS_READ, ""),
    ("GET", "/medical-records/patients/{patient_id}/vitals/trend", None, RECORDS_READ, ""),
    ("GET", "/medical-records/vitals/review-queue", None, DOCTOR_ADMIN, ""),
    ("POST", "/medical-records/vitals/{vital_id}/acknowledge", None, DOCTOR_ADMIN, ""),
    ("GET", "/medical-records/patients/{patient_id}/care-plan", None, RECORDS_READ, ""),
    (
        "POST",
        "/medical-records/patients/{patient_id}/care-plan",
        {"description": "RBAC care item", "priority": "normal"},
        DOCTOR_NURSE_ADMIN,
        "",
    ),
    (
        "PATCH",
        "/medical-records/care-plan/{item_id}",
        {"description": "RBAC updated"},
        DOCTOR_NURSE_ADMIN,
        "",
    ),
    ("POST", "/medical-records/care-plan/{item_id}/complete", None, DOCTOR_NURSE_ADMIN, ""),
    (
        "POST",
        "/medical-records/care-plan/{item_id}/reassign",
        {"assigned_to": "{nurse_id}"},
        DOCTOR_NURSE_ADMIN,
        "",
    ),
    ("GET", "/medical-records/care-plan/shift-handover", None, DOCTOR_NURSE_ADMIN, ""),
    ("GET", "/medical-records/attachments/{att_id}/download", None, RECORDS_READ, ""),
    (
        "POST",
        "/medical-records/visits/{visit_id}/attachments",
        None,
        DOCTOR_NURSE_ADMIN,
        "multipart",
    ),
    # ---- Billing --------------------------------------------------------
    ("GET", "/billing/invoices", None, BILLING_ROLES, ""),
    ("GET", "/billing/invoices/{invoice_id}", None, BILLING_ROLES, ""),
    (
        "POST",
        "/billing/invoices",
        {
            "patient_id": "{patient_id}",
            "line_items": [
                {"code": "X2", "description": "RBAC invoice", "quantity": 1, "unit_amount": 50}
            ],
        },
        BILLING_ROLES,
        "",
    ),
    ("POST", "/billing/invoices/{invoice_id}/void", None, ADMIN_ONLY, ""),
    (
        "POST",
        "/billing/invoices/{invoice_id}/payments",
        {"amount": 10, "method": "cash"},
        BILLING_ROLES,
        "",
    ),
    (
        "POST",
        "/billing/invoices/{invoice_id}/claim",
        {"payer_name": "RBAC Payer 2", "claim_number": "RBAC-2"},
        BILLING_ROLES,
        "",
    ),
    ("PATCH", "/billing/claims/{claim_id}", {"status": "submitted"}, BILLING_ROLES, ""),
    ("GET", "/billing/claims", None, BILLING_ROLES, ""),
    ("GET", "/billing/claims/{claim_id}", None, BILLING_ROLES, ""),
    # ---- Admin domain ---------------------------------------------------
    ("GET", "/admin/users", None, ADMIN_ONLY, ""),
    ("GET", "/admin/users/{admin_id}", None, ADMIN_ONLY, ""),
    (
        "POST",
        "/admin/users",
        {
            "email": "rbac2@hospital.test",
            "password": "Hospital2025!",
            "full_name": "RBAC Two",
            "role": "nurse",
        },
        ADMIN_ONLY,
        "",
    ),
    ("PATCH", "/admin/users/{patch_user_id}", {"role": "doctor"}, ADMIN_ONLY, ""),
    ("POST", "/admin/users/{patch_user_id}/deactivate", None, ADMIN_ONLY, ""),
    ("GET", "/admin/departments", None, ALL, ""),
    ("GET", "/admin/departments/{dept_gen}", None, ALL, ""),
    (
        "POST",
        "/admin/departments",
        {"name": "RBAC Dept", "code": "RBA", "type": "general"},
        ADMIN_ONLY,
        "",
    ),
    ("PATCH", "/admin/departments/{dept_gen}", {"name": "RBAC Renamed"}, ADMIN_ONLY, ""),
    ("GET", "/admin/department-staff", None, ALL, ""),
    (
        "POST",
        "/admin/department-staff",
        {"user_id": "{doctor_id}", "department_id": "{dept_car}"},
        ADMIN_ONLY,
        "",
    ),
    ("DELETE", "/admin/department-staff/{assignment_id}", None, ADMIN_ONLY, ""),
    (
        "POST",
        "/admin/patient-assignments",
        {
            "patient_id": "{patient_id}",
            "user_id": "{nurse_id}",
            "role": "nurse",
            "shift_start": "{start_iso}",
            "shift_end": "{start_iso2}",
        },
        ADMIN_ONLY,
        "",
    ),
    ("GET", "/admin/users/{nurse_id}/my-patients", None, {"admin", "nurse"}, ""),
    ("DELETE", "/admin/patient-assignments/{assignment_id}", None, ADMIN_ONLY, ""),
    ("GET", "/admin/departments/over-capacity", None, ADMIN_ONLY, ""),
    ("GET", "/admin/departments/{dept_gen}/capacity", None, {"admin", "doctor", "nurse"}, ""),
    (
        "PATCH",
        "/admin/departments/{dept_gen}/capacity",
        {"min_clinicians_per_shift": 2},
        ADMIN_ONLY,
        "",
    ),
    # ---- Widget config --------------------------------------------------
    ("GET", "/widget-config/widgets", None, ALL, ""),
    ("GET", "/widget-config/widgets/admin/library", None, ADMIN_ONLY, ""),
    (
        "PATCH",
        "/widget-config/widgets/{lock_widget_id}/lock",
        {"globally_locked": True},
        ADMIN_ONLY,
        "",
    ),
    ("GET", "/widget-config/me", None, ALL, ""),
    ("PUT", "/widget-config/me", {"items": []}, ALL, ""),
    ("DELETE", "/widget-config/me/{widget_id}", None, ALL, ""),
    # ---- Audit ----------------------------------------------------------
    ("GET", "/audit/log", None, ADMIN_ONLY, ""),
    ("GET", "/audit/log/{entry_id}", None, ADMIN_ONLY, ""),
    ("GET", "/audit/actions", None, ADMIN_ONLY, ""),
]


def _render_path(template: str, ids: dict, conn) -> str:
    # Stub placeholders .format() would choke on; the DB lookups below override.
    placeholders = {
        "allergy_id": 999999,
        "assignment_id": 999999,
        "blocked_id": 999999,
        "rx_id": 999999,
        "widget_id": 999999,
        "lock_widget_id": 999999,
        "att_id": 999999,
        "entry_id": 999999,
        "vital_id": 999999,
        "item_id": 999999,
    }
    path = template.format(**{**ids, **placeholders})
    if "{allergy_id}" in path:
        allergy = conn.execute("SELECT id FROM patient_allergies ORDER BY id LIMIT 1").fetchone()
        path = path.replace("{allergy_id}", str(allergy["id"] if allergy else 999999))
    if "{assignment_id}" in path:
        assign = conn.execute("SELECT id FROM department_staff ORDER BY id LIMIT 1").fetchone()
        path = path.replace("{assignment_id}", str(assign["id"] if assign else 999999))
    if "{blocked_id}" in path:
        block = conn.execute("SELECT id FROM doctor_blocked_days ORDER BY id LIMIT 1").fetchone()
        path = path.replace("{blocked_id}", str(block["id"] if block else 999999))
    if "{rx_id}" in path:
        rx = conn.execute("SELECT id FROM prescriptions ORDER BY id LIMIT 1").fetchone()
        path = path.replace("{rx_id}", str(rx["id"] if rx else 999999))
    if "{widget_id}" in path:
        widget = conn.execute(
            "SELECT id FROM widget_definitions WHERE key = 'revenue-month'"
        ).fetchone()
        path = path.replace("{widget_id}", str(widget["id"] if widget else 1))
    if "{lock_widget_id}" in path:
        widget = conn.execute(
            "SELECT id FROM widget_definitions WHERE key = 'recent-patients'"
        ).fetchone()
        path = path.replace("{lock_widget_id}", str(widget["id"] if widget else 1))
    if "{att_id}" in path:
        att = conn.execute("SELECT id FROM attachments ORDER BY id LIMIT 1").fetchone()
        path = path.replace("{att_id}", str(att["id"] if att else 999999))
    if "{entry_id}" in path:
        entry = conn.execute("SELECT id FROM audit_log ORDER BY id LIMIT 1").fetchone()
        path = path.replace("{entry_id}", str(entry["id"] if entry else 999999))
    if "{vital_id}" in path:
        vital = conn.execute("SELECT id FROM vitals ORDER BY id LIMIT 1").fetchone()
        path = path.replace("{vital_id}", str(vital["id"] if vital else 999999))
    if "{item_id}" in path:
        item = conn.execute("SELECT id FROM care_plan_items ORDER BY id LIMIT 1").fetchone()
        path = path.replace("{item_id}", str(item["id"] if item else 999999))
    return path


def _render_body(body, ids: dict) -> dict | None:
    if body is None:
        return None
    rendered: dict = {}
    for key, value in body.items():
        if isinstance(value, str):
            value = value.format(**ids)
        if isinstance(value, list):
            value = [
                {k: (v.format(**ids) if isinstance(v, str) else v) for k, v in item.items()}
                for item in value
            ]
        rendered[key] = value
    return rendered


def _run_matrix():
    """Exercise every manifest case for every role; returns (failures, checked)."""
    ids = _resolve_ids()
    ids["start_iso"] = (
        (datetime.now(UTC) + timedelta(days=2))
        .replace(hour=10, minute=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
    ids["start_iso2"] = (
        (datetime.now(UTC) + timedelta(days=2))
        .replace(hour=11, minute=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
    ids["blocked_date"] = (datetime.now(UTC).date() + timedelta(days=5)).isoformat()
    ids = _create_resources(ids)

    failures: list[str] = []
    checked = 0

    for method, template, body, allowed, kind in CASES:
        with _db_conn() as conn:
            path = _render_path(template, ids, conn)
        payload = _render_body(body, ids)
        files = None
        if kind == "multipart":
            files = {"file": ("rbac.png", b"rbac attachment", "image/png")}
            existing = _snapshot_attachment_dir(ids["visit_id"])

        for role in ROLES:
            checked += 1
            resp = client.request(
                method,
                path,
                json=payload if files is None else None,
                files=files,
                headers=_headers(role),
            )
            if role in allowed:
                if resp.status_code in (401, 403, 500):
                    failures.append(
                        f"{method} {path}: {role} SHOULD be allowed, got {resp.status_code}"
                    )
            else:
                if resp.status_code != 403:
                    failures.append(
                        f"{method} {path}: {role} SHOULD be denied, got {resp.status_code}"
                    )

        # Anonymous: never a 500, always an auth failure.
        checked += 1
        resp = client.request(method, path, json=payload if files is None else None, files=files)
        if resp.status_code not in (401, 403):
            failures.append(
                f"{method} {path}: anonymous SHOULD be rejected, got {resp.status_code}"
            )

        if kind == "multipart":
            _cleanup_attachments(ids["visit_id"], existing)

    return failures, checked


def test_rbac_matrix_admin_doctor_nurse_receptionist_anon():
    failures, checked = _run_matrix()
    assert not failures, "\n".join(failures)
    # Sanity: the manifest actually exercised a meaningful matrix.
    assert checked >= 200


def test_rbac_matrix_covers_every_protected_route():
    """The manifest must reference every protected route on the app, so a new
    endpoint cannot ship without an RBAC expectation."""
    from app.main import app

    app_templates = set()
    for route in app.routes:
        for method in sorted(getattr(route, "methods", []) or []):
            if method in {"GET", "POST", "PATCH", "PUT", "DELETE"} and route.path.startswith(
                (
                    "/patients",
                    "/appointments",
                    "/doctors",
                    "/billing",
                    "/admin",
                    "/widget-config",
                    "/audit",
                    "/medical-records",
                )
            ):
                tpl = re.sub(r"\{[^}]+\}", "{}", route.path)
                app_templates.add(f"{method} {tpl}")

    manifest_templates = set()
    for method, path, _, _, _ in CASES:
        tpl = re.sub(r"\{[^}]+\}", "{}", path)
        manifest_templates.add(f"{method} {tpl}")
    missing = app_templates - manifest_templates
    assert not missing, f"endpoints missing from RBAC manifest: {sorted(missing)}"


def _snapshot_attachment_dir(visit_id: int) -> set[str]:
    """Existing files under the visit's attachment dir before the probe runs."""
    from app.routers.medical_records import ATTACHMENT_STORAGE

    visit_dir = ATTACHMENT_STORAGE / str(visit_id)
    return {f.name for f in visit_dir.iterdir()} if visit_dir.is_dir() else set()


def _cleanup_attachments(visit_id: int, existing: set[str]) -> None:
    """Remove only the attachment files the probe created, never tracked ones."""
    from app.routers.medical_records import ATTACHMENT_STORAGE

    visit_dir = ATTACHMENT_STORAGE / str(visit_id)
    if not visit_dir.is_dir():
        return
    for path in visit_dir.iterdir():
        if path.name not in existing:
            path.unlink(missing_ok=True)
    if not any(visit_dir.iterdir()):
        visit_dir.rmdir()
