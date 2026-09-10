"""Shared test configuration.

All test files must run against the SAME migrated + seeded SQLite file, because
the FastAPI `app` instance is imported once and resolves its database path from
`DATABASE_PATH` at import time. A per-file tempfile means later files query a
different database than the app reads, which is the test-pollution bug behind
tickets #19/#20.

An autouse fixture recreates a pristine migrated + seeded database before every
test, so test-created rows (users, patients, appointments) never leak into the
next test.
"""

from __future__ import annotations

import os
import pathlib
import sys

import pytest

_BACKEND_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

_SHARED_DB = pathlib.Path("/tmp/hospital-test-shared.db").resolve()
os.environ["DATABASE_PATH"] = str(_SHARED_DB)
os.environ["JWT_SECRET"] = "test-secret"
os.environ["BCRYPT_ROUNDS"] = "4"


@pytest.fixture(autouse=True)
def _reset_db_per_test():
    from db.migrate import run_migrations
    from db.seed import run_seed

    if _SHARED_DB.exists():
        _SHARED_DB.unlink()
    run_migrations(_SHARED_DB)
    run_seed(_SHARED_DB)
    yield
