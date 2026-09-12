"""Patient-assignment helpers (tickets #42/#44/#45).

The on-disk `patient_assignments` table predates the wave-4 columns, so the
physical schema may carry either the legacy (`nurse_id`, `shift_date`,
`shift_window`, `assigned_at`) or the wave-4 (`user_id`, `role`,
`shift_start`, `shift_end`, `status`) column set — or both, after the 0004
migration. Every helper is schema-adaptive: it writes/reads whichever columns
exist and backfills the legacy NOT NULL pair so old rows never break.

No connection management here; callers pass a live connection so the helper
participates in the caller's transaction.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime

ACTIVE = "active"
CANCELLED = "cancelled"


def _cols(conn) -> set[str]:
    return {r[1] for r in conn.execute("PRAGMA table_info(patient_assignments)").fetchall()}


def _user_column(conn) -> str:
    return "user_id" if "user_id" in _cols(conn) else "nurse_id"


def insert_assignment(
    conn,
    *,
    patient_id: int,
    user_id: int,
    role: str,
    shift_start: int,
    shift_end: int,
    bed_label: str | None = None,
    created_by: int | None = None,
) -> int:
    """Insert one assignment, backfilling legacy columns so the row satisfies
    the old NOT NULL constraints. Returns the new row id."""
    now = int(time.time())
    day = datetime.fromtimestamp(shift_start, UTC).date().isoformat()
    start_dt = datetime.fromtimestamp(shift_start, UTC)
    end_dt = datetime.fromtimestamp(shift_end, UTC)
    window = f"{start_dt:%H:%M}-{end_dt:%H:%M}"
    cols = _cols(conn)
    col_map = {
        "patient_id": patient_id,
        "nurse_id": user_id,
        "user_id": user_id,
        "role": role or "nurse",
        "shift_start": shift_start,
        "shift_end": shift_end,
        "shift_date": day,
        "shift_window": window,
        "bed_label": bed_label,
        "status": ACTIVE,
        "created_by": created_by,
        "assigned_at": now,
    }
    names = [c for c in col_map if c in cols]
    placeholders = ",".join("?" for _ in names)
    cur = conn.execute(
        f"INSERT INTO patient_assignments ({','.join(names)}) VALUES ({placeholders})",
        [col_map[c] for c in names],
    )
    return cur.lastrowid


def find_overlap(
    conn,
    *,
    patient_id: int,
    user_id: int,
    shift_start: int,
    shift_end: int,
    exclude_id: int | None = None,
) -> int | None:
    """Return an active assignment id that overlaps [shift_start, shift_end)
    for the same patient + user, or None. Overlap = one window starts before
    the other ends (shared endpoints count as non-overlapping)."""
    cols = _cols(conn)
    params: list = [patient_id, user_id]
    status_cond = ""
    if "status" in cols:
        status_cond = "AND status = ?"
    if "shift_start" in cols and "shift_end" in cols:
        sql = (
            f"SELECT id FROM patient_assignments WHERE patient_id = ? "
            f"AND {_user_column(conn)} = ? AND shift_start < ? AND shift_end > ? {status_cond}"
        )
        params.extend([shift_end, shift_start])
    else:
        day = datetime.fromtimestamp(shift_start, UTC).date().isoformat()
        sql = (
            f"SELECT id FROM patient_assignments WHERE patient_id = ? "
            f"AND {_user_column(conn)} = ? AND shift_date = ? {status_cond}"
        )
        params.append(day)
    if "status" in cols:
        params.append(ACTIVE)
    if exclude_id is not None:
        sql += " AND id != ?"
        params.append(exclude_id)
    row = conn.execute(sql, params).fetchone()
    return row["id"] if row else None


def assignments_for_user_on_date(conn, user_id: int, shift_date: str) -> list:
    """All active assignments for a user whose shift covers `shift_date`."""
    cols = _cols(conn)
    params: list = [user_id]
    status_cond = ""
    if "status" in cols:
        status_cond = "AND status = ?"
    if "shift_date" in cols:
        params.append(shift_date)
        sql = (
            f"SELECT * FROM patient_assignments WHERE {_user_column(conn)} = ? "
            f"AND shift_date = ? {status_cond} ORDER BY id"
        )
    else:
        day_start = int(
            datetime.fromisoformat(f"{shift_date}T00:00:00+00:00").timestamp()
        )
        day_end = day_start + 86400
        params.extend([day_end, day_start])
        sql = (
            f"SELECT * FROM patient_assignments WHERE {_user_column(conn)} = ? "
            f"AND shift_start < ? AND shift_end > ? {status_cond} ORDER BY id"
        )
    if "status" in cols:
        params.append(ACTIVE)
    return conn.execute(sql, params).fetchall()