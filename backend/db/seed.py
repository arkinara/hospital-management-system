"""Seed placeholder fixtures into the shared SQLite file.

Usage: `python -m db.seed` (run from `backend/`). Must be run after migrate.

Idempotent by construction: every row uses a natural unique key and inserts
with INSERT OR IGNORE, so re-seeding never duplicates rows. The real fixture
set lands in ticket #38; this file currently seeds a few departments plus one
placeholder patient so the health check and the frontend token demo have data
to point at.
"""

from __future__ import annotations

import sqlite3
import sys
import time
from pathlib import Path

from app.config import get_settings

DEPARTMENTS = [
    ("General", "GEN", "general", 40, 4),
    ("Pediatrics", "PED", "pediatric", 20, 3),
    ("Cardiology", "CAR", "cardiology", 15, 2),
    ("Emergency", "ER", "emergency", 25, 5),
]

PLACEHOLDER_PATIENTS = [
    ("MRN-000001", "Seed Patient One", "standard", "outpatient"),
]


def run_seed(db_path: Path) -> int:
    if not db_path.is_file():
        raise SystemExit(f"Database not found at {db_path}. Run `python -m db.migrate` first.")

    conn = sqlite3.connect(db_path)
    now = int(time.time())
    inserted = 0

    cursor = conn.executemany(
        "INSERT OR IGNORE INTO departments "
        "(name, code, type, bed_capacity, min_clinicians_per_shift, active, created_at) "
        "VALUES (?, ?, ?, ?, ?, 1, ?)",
        [(*department, now) for department in DEPARTMENTS],
    )
    inserted += cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0

    cursor = conn.executemany(
        "INSERT OR IGNORE INTO patients "
        "(mrn, full_name, acuity, status, created_at) VALUES (?, ?, ?, ?, ?)",
        [(*patient, now) for patient in PLACEHOLDER_PATIENTS],
    )
    inserted += cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0

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
