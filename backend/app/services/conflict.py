"""Appointment conflict detection (ticket #20).

A doctor can never be double-booked into two overlapping appointments. The
check is server-enforced on every booking write (POST and PATCH) and treats
`cancelled`/`no_show` appointments as free — their former slot can be reused.

Overlap is a half-open interval intersection: `requested_start < existing_end`
and `existing_start < requested_end`.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

# Statuses that do NOT occupy a slot.
FREE_STATUSES = ("cancelled", "no_show")


@dataclass(frozen=True)
class Conflict:
    appointment_id: int
    start: int
    end: int
    status: str


def appointment_end(row: sqlite3.Row) -> int:
    """Resolve an appointment's end epoch, falling back to start + duration."""
    if row["scheduled_end"] is not None:
        return int(row["scheduled_end"])
    return int(row["scheduled_at"]) + int(row["duration_minutes"] or 30) * 60


def find_doctor_conflict(
    conn: sqlite3.Connection,
    doctor_id: int,
    start: int,
    end: int,
    exclude_id: int | None = None,
) -> Conflict | None:
    """Return the first appointment for `doctor_id` overlapping [start, end)."""
    rows = conn.execute(
        "SELECT id, scheduled_at, scheduled_end, duration_minutes, status "
        "FROM appointments "
        "WHERE doctor_id = ? AND status NOT IN ('cancelled', 'no_show') "
        "ORDER BY scheduled_at",
        (doctor_id,),
    ).fetchall()
    for row in rows:
        if exclude_id is not None and row["id"] == exclude_id:
            continue
        existing_start = int(row["scheduled_at"])
        existing_end = appointment_end(row)
        if start < existing_end and existing_start < end:
            return Conflict(row["id"], existing_start, existing_end, row["status"])
    return None
