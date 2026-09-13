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

from app.main import app

FRONTEND_SRC = Path(__file__).resolve().parents[2] / "frontend" / "src"

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
