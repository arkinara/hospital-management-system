"""Apply Drizzle migrations to the shared SQLite file.

Usage: `python -m db.migrate` (run from `backend/`).

Reads the checked-in Drizzle migration journal (`frontend/db/migrations/`),
applies any migration newer than the last recorded one, and records it in
`__drizzle_migrations` in the same shape drizzle-orm expects. Re-running on
an up-to-date database is a no-op.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
from pathlib import Path

from app.config import get_settings

BACKEND_DIR = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = BACKEND_DIR.parent / "frontend" / "db" / "migrations"
JOURNAL_PATH = MIGRATIONS_DIR / "meta" / "_journal.json"
MIGRATIONS_TABLE = "__drizzle_migrations"

STATEMENT_BREAKPOINT = "--> statement-breakpoint"


def _connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.executescript(
        f"CREATE TABLE IF NOT EXISTS {MIGRATIONS_TABLE} "
        "(id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric);"
    )
    return conn


def run_migrations(db_path: Path) -> int:
    if not JOURNAL_PATH.is_file():
        raise FileNotFoundError(
            f"Drizzle migration journal not found at {JOURNAL_PATH}. "
            "Generate migrations with `npm run db:generate` in frontend/ first."
        )

    journal = json.loads(JOURNAL_PATH.read_text(encoding="utf-8"))
    conn = _connect(db_path)
    last = conn.execute(
        f"SELECT created_at FROM {MIGRATIONS_TABLE} ORDER BY created_at DESC LIMIT 1"
    ).fetchone()
    last_ts = float(last[0]) if last else 0.0

    applied = 0
    for entry in journal["entries"]:
        when = float(entry["when"])
        if when <= last_ts:
            continue
        sql_path = MIGRATIONS_DIR / f"{entry['tag']}.sql"
        sql = sql_path.read_text(encoding="utf-8")
        for statement in sql.split(STATEMENT_BREAKPOINT):
            statement = statement.strip()
            if statement:
                conn.execute(statement)
        digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()
        conn.execute(
            f"INSERT INTO {MIGRATIONS_TABLE} (hash, created_at) VALUES (?, ?)",
            (digest, when),
        )
        applied += 1

    conn.commit()
    conn.close()
    return applied


def main() -> int:
    db_path = get_settings().resolved_database_path
    applied = run_migrations(db_path)
    print(f"db.migrate: {applied} migration(s) applied to {db_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
