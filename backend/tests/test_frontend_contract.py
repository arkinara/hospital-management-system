"""Every API path the frontend calls must exist on this backend.

The frontend used to be wired to the MSW mock contract, which drifted from the
real routes (``/invoices`` vs ``/billing/invoices``, ``/permissions`` vs
``/auth/permissions``, ...). Tests stayed green because the mocks answered.
This test reads the frontend sources directly, so a renamed or deleted route
fails here instead of in production.

Note: this checks *paths only*. Payload shapes and identifier types are still
mapped by hand — see AUDIT.md.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from test_auth import bearer, client, login

from app.main import app

FRONTEND_SRC = Path(__file__).resolve().parents[2] / "frontend" / "src"
HANDLERS = FRONTEND_SRC / "lib" / "api" / "handlers.ts"
# Seeded demo admin; the seeded widget layout belongs to this account.
ADMIN = ("rahmat.h@sirkaya.health", "Hospital2025!")

# api.get<T>("/path"), api.post(`/path/${id}`), ...
CALL = re.compile(
    r"""api\.(get|post|patch|put|delete)\s*(?:<[^(]*?>)?\s*\(\s*([`"'])(.*?)\2""", re.S
)

# Mock-only modules: they define the fake server, not calls the app makes.
SKIP = ("api/handlers", "api/stubs")


def _frontend_calls() -> set[tuple[str, str]]:
    calls = set()
    for path in FRONTEND_SRC.rglob("*.ts*"):
        if any(part in str(path) for part in SKIP):
            continue
        for method, _, raw in CALL.findall(path.read_text()):
            url = re.sub(r"\$\{[^}]+\}", "{}", raw).split("?")[0]
            if url.startswith("/"):
                calls.add((method.upper(), url))
    return calls


def _backend_routes() -> set[tuple[str, str]]:
    routes = set()
    for route in app.routes:
        for method in getattr(route, "methods", None) or []:
            if method in {"GET", "POST", "PATCH", "PUT", "DELETE"}:
                routes.add((method, re.sub(r"\{[^}]+\}", "{}", route.path)))
    return routes


def test_frontend_sources_exist():
    """Guard the guard: a moved frontend directory must not silently pass."""
    assert FRONTEND_SRC.is_dir(), f"frontend sources not found at {FRONTEND_SRC}"
    assert len(_frontend_calls()) > 30


@pytest.mark.skipif(not FRONTEND_SRC.is_dir(), reason="frontend sources not checked out")
def test_every_frontend_call_hits_a_real_route():
    unmatched = sorted(_frontend_calls() - _backend_routes())
    assert not unmatched, "frontend calls with no backend route: " + ", ".join(
        f"{m} {p}" for m, p in unmatched
    )


# ---------------------------------------------------------------------------
# Response-shape contract (#57.5)
#
# Path equality is not enough: the MSW handlers now emit backend-shaped rows,
# and each row mapper is the frontend's declaration of the fields it reads.
# Here we bring up the real FastAPI app against the seeded DB, capture the keys
# each endpoint actually returns, and assert every key the frontend reads is
# present. A renamed backend serialiser key fails this test instead of silently
# blanking a panel.
# ---------------------------------------------------------------------------


def _brace_body(text: str, open_index: int) -> str:
    """Return the text between matching braces starting at ``open_index``."""
    depth = 0
    for i in range(open_index, len(text)):
        char = text[i]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[open_index + 1 : i]
    raise AssertionError("unbalanced braces in frontend handler")


def _msw_mapper_keys() -> dict[str, set[str]]:
    """Top-level keys emitted by each MSW ``be*`` backend-row mapper."""
    text = HANDLERS.read_text()
    pattern = re.compile(
        r"function\s+(be[A-Za-z0-9]+)\s*\([^)]*\)\s*:\s*Record<string,\s*unknown>\s*\{"
    )
    mappers: dict[str, set[str]] = {}
    for match in pattern.finditer(text):
        body = _brace_body(text, match.end() - 1)
        mappers[match.group(1)] = set(re.findall(r"^\s*([a-z_][a-z0-9_]*)\s*:", body, re.M))
    return mappers


def _k(payload: dict) -> set[str]:
    return set(payload.keys())


def _admin_headers() -> dict[str, str]:
    return bearer(login(*ADMIN)["access_token"])


def test_msw_mappers_are_extractable():
    """Guard the guard: a moved/renamed handlers file must not pass silently."""
    mappers = _msw_mapper_keys()
    assert len(mappers) >= 10, f"only found mappers: {sorted(mappers)}"
    for name, keys in mappers.items():
        assert keys, f"{name} yielded no keys"
    assert "full_name" in mappers["bePatient"]
    assert "total_amount" in mappers["beInvoice"]
    assert "patient_id" in mappers["beVisitNote"]


def test_patient_and_record_keys_are_present_in_backend_shapes():
    h = _admin_headers()
    mappers = _msw_mapper_keys()

    patients = client.get(
        "/patients", headers=h, params={"query": "P-001042", "page_size": 1}
    ).json()["patients"]
    assert patients, "seed has no P-001042"
    patient = patients[0]
    pid = patient["id"]
    assert mappers["bePatient"] <= _k(patient), sorted(mappers["bePatient"] - _k(patient))

    summary = client.get(f"/patients/{pid}/clinical-summary", headers=h).json()
    assert summary["allergies"], "seed has no allergy"
    assert mappers["beAllergy"] <= _k(summary["allergies"][0]), sorted(
        mappers["beAllergy"] - _k(summary["allergies"][0])
    )

    events = client.get(f"/medical-records/patients/{pid}/history", headers=h).json()["events"]
    assert events, "seed has no history events"
    assert mappers["beHistoryEvent"] <= _k(events[0])

    rx = client.get(
        f"/medical-records/patients/{pid}/prescriptions", headers=h
    ).json()["prescriptions"]
    assert rx, "seed has no prescriptions"
    assert mappers["bePrescription"] <= _k(rx[0]), sorted(mappers["bePrescription"] - _k(rx[0]))

    visits = client.get(
        "/medical-records/visits", headers=h, params={"limit": 1}
    ).json()["visits"]
    assert visits, "seed has no visit notes"
    assert mappers["beVisitNote"] <= _k(visits[0]), sorted(mappers["beVisitNote"] - _k(visits[0]))

    care = client.get(
        f"/medical-records/patients/{pid}/care-plan", headers=h
    ).json()["items"]
    assert care, "seed has no care plan items"
    assert mappers["beCarePlanItem"] <= _k(care[0])


def test_billing_keys_are_present_in_backend_shapes():
    h = _admin_headers()
    mappers = _msw_mapper_keys()

    invoices = client.get(
        "/billing/invoices", headers=h, params={"limit": 100}
    ).json()["invoices"]
    assert invoices, "seed has no invoices"
    assert mappers["beInvoice"] <= _k(invoices[0]), sorted(mappers["beInvoice"] - _k(invoices[0]))

    line_keys: set[str] = set()
    payment_keys: set[str] = set()
    claim_keys: set[str] = set()
    for inv in invoices:
        detail = client.get(f"/billing/invoices/{inv['id']}", headers=h).json()
        if detail["line_items"] and not line_keys:
            line_keys = _k(detail["line_items"][0])
        if detail["payments"] and not payment_keys:
            payment_keys = _k(detail["payments"][0])
        if detail["claims"] and not claim_keys:
            claim_keys = _k(detail["claims"][0])
        if line_keys and payment_keys and claim_keys:
            break

    assert line_keys, "no invoice line item in seed"
    assert payment_keys, "no payment in seed"
    assert claim_keys, "no claim in seed"
    assert mappers["beInvoiceLine"] <= line_keys
    assert mappers["bePayment"] <= payment_keys
    assert mappers["beClaim"] <= claim_keys


def test_widget_keys_are_present_in_backend_shapes():
    h = _admin_headers()
    mappers = _msw_mapper_keys()

    widgets = client.get("/widget-config/widgets", headers=h).json()["widgets"]
    assert widgets, "seed has no widget definitions"
    assert mappers["beWidgetDefinition"] <= _k(widgets[0])

    me = client.get("/widget-config/me", headers=h).json()
    assert me["items"], "seed has no admin widget layout"
    assert mappers["beWidgetLayoutItem"] <= _k(me["items"][0]), sorted(
        mappers["beWidgetLayoutItem"] - _k(me["items"][0])
    )
