"""Seed fixtures into the shared SQLite file.

Usage: `python -m db.seed` (run from `backend/`). Must be run after migrate.

Idempotent by construction: every row uses a natural unique key and inserts
with INSERT OR IGNORE, so re-seeding never duplicates rows. Passwords are
bcrypt-hashed; the seeded accounts use the dev password below (documented in
the repo README).

Seed accounts (password: `Hospital2025!`):
  admin@hospital.test          admin
  doctor@hospital.test         doctor
  nurse@hospital.test          nurse
  receptionist@hospital.test   receptionist

The permission_matrix is seeded with an explicit allow/deny row for every
role x module combination (admin all; doctor patients/appointments/records;
nurse patients/records; receptionist patients/appointments/billing).
"""

from __future__ import annotations

import sqlite3
import sys
import time
from pathlib import Path

from app.config import get_settings
from app.security import hash_password

DEPARTMENTS = [
    ("General", "GEN", "general", 40, 4),
    ("Pediatrics", "PED", "pediatric", 20, 3),
    ("Cardiology", "CAR", "cardiology", 15, 2),
    ("Emergency", "ER", "emergency", 25, 5),
]

PLACEHOLDER_PATIENTS = [
    ("MRN-000001", "Seed Patient One", "standard", "outpatient"),
]

SEED_PASSWORD = "Hospital2025!"

USERS = [
    ("admin@hospital.test", "System Admin", "admin", None),
    ("doctor@hospital.test", "Dr. Alice Chen", "doctor", 3),
    ("nurse@hospital.test", "Nurse Bob Tan", "nurse", 2),
    ("receptionist@hospital.test", "Receptionist Carol", "receptionist", 1),
]

MODULES = [
    "patients",
    "appointments",
    "records",
    "billing",
    "admin",
    "widget-config",
    "audit",
]

# Role -> modules allowed. Everything not listed is explicitly denied.
MATRIX = {
    "admin": set(MODULES),
    "doctor": {"patients", "appointments", "records"},
    "nurse": {"patients", "records"},
    "receptionist": {"patients", "appointments", "billing"},
}


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

    password_hash = hash_password(SEED_PASSWORD)
    cursor = conn.executemany(
        "INSERT OR IGNORE INTO users "
        "(email, full_name, role, department_id, password_hash, is_active, created_at) "
        "VALUES (?, ?, ?, ?, ?, 1, ?)",
        [(*user, password_hash, now) for user in USERS],
    )
    inserted += cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0

    matrix_rows = [
        (role, module, int(module in MATRIX[role]), int(module in MATRIX[role]))
        for role in MATRIX
        for module in MODULES
    ]
    cursor = conn.executemany(
        "INSERT OR IGNORE INTO permission_matrix "
        "(role, module, allowed, can_view) VALUES (?, ?, ?, ?)",
        matrix_rows,
    )
    inserted += cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0

    has_init = conn.execute(
        "SELECT 1 FROM audit_log WHERE action = 'system.init' LIMIT 1"
    ).fetchone()
    if has_init is None:
        conn.execute(
            "INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, "
            "after_json, created_at) "
            "VALUES (NULL, 'system.init', 'system', NULL, NULL, ?)",
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
