"""Availability rules engine (ticket #20).

Constrains bookings to a doctor's configured working hours and keeps out
blocked days. Exposes the 15-minute slot grid the daily-schedule endpoint and
the booking preflight both consume:

- `get_doctor_slots(doctor_id, date)`   -> slot grid for one day
- `is_doctor_available(doctor_id, start, end)` -> hard allow/deny on booking

Time is UTC epoch seconds, matching the shared SQLite schema. Dates are
interpreted as UTC calendar days (`YYYY-MM-DD`).
"""

from __future__ import annotations

import sqlite3
from datetime import UTC, date, datetime

from app.services.conflict import find_doctor_conflict

SLOT_MINUTES = 15

# Default working hours applied only to doctors that have NO availability
# rows at all (fixtures/seed never configured one): Mon-Fri 08:00-17:00.
DEFAULT_WINDOWS: dict[int, list[tuple[str, str]]] = {
    weekday: [("08:00", "17:00")] for weekday in range(5)
}


def parse_date(value: str | date) -> date:
    if isinstance(value, date):
        return value
    return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()


def day_epoch(day: date, clock: str) -> int:
    hour, minute = clock.split(":")
    dt = datetime(day.year, day.month, day.day, int(hour), int(minute), tzinfo=UTC)
    return int(dt.timestamp())


def _windows_for(conn: sqlite3.Connection, doctor_id: int, weekday: int) -> list[tuple[str, str]]:
    any_row = conn.execute(
        "SELECT 1 FROM doctor_availability WHERE doctor_id = ? LIMIT 1", (doctor_id,)
    ).fetchone()
    if any_row is None:
        return list(DEFAULT_WINDOWS.get(weekday, []))
    rows = conn.execute(
        "SELECT start_time, end_time FROM doctor_availability "
        "WHERE doctor_id = ? AND day_of_week = ? ORDER BY start_time",
        (doctor_id, weekday),
    ).fetchall()
    return [(r["start_time"], r["end_time"]) for r in rows]


def is_blocked_day(conn: sqlite3.Connection, doctor_id: int, day: date) -> bool:
    row = conn.execute(
        "SELECT 1 FROM doctor_blocked_days WHERE doctor_id = ? AND blocked_date = ? LIMIT 1",
        (doctor_id, day.isoformat()),
    ).fetchone()
    return row is not None


def _blocked_partial(conn: sqlite3.Connection, doctor_id: int, day: date) -> list[tuple[int, int]]:
    """Return epoch ranges for same-day partial blocks (blocked_date + times)."""
    ranges: list[tuple[int, int]] = []
    rows = conn.execute(
        "SELECT start_time, end_time FROM doctor_blocked_days "
        "WHERE doctor_id = ? AND blocked_date = ?",
        (doctor_id, day.isoformat()),
    ).fetchall()
    for row in rows:
        if row["start_time"] and row["end_time"]:
            ranges.append((day_epoch(day, row["start_time"]), day_epoch(day, row["end_time"])))
    return ranges


def get_doctor_slots(
    conn: sqlite3.Connection, doctor_id: int, value: str | date
) -> list[dict]:
    """Return the 15-minute slot grid for one doctor/day.

    A fully blocked day yields an empty grid (blocked days do not surface).
    Every slot is `free`, `booked` (with appointment id), or `blocked`.
    """
    day = parse_date(value)
    if is_blocked_day(conn, doctor_id, day):
        return []

    windows = _windows_for(conn, doctor_id, day.weekday())
    if not windows:
        return []

    appointments = conn.execute(
        "SELECT id, patient_id, scheduled_at, scheduled_end, duration_minutes, reason "
        "FROM appointments "
        "WHERE doctor_id = ? AND status NOT IN ('cancelled', 'no_show') "
        "ORDER BY scheduled_at",
        (doctor_id,),
    ).fetchall()
    booked_ranges = [
        (int(a["scheduled_at"]), _appt_end(a), a) for a in appointments
    ]
    partial_blocks = _blocked_partial(conn, doctor_id, day)

    slots: list[dict] = []
    for start_time, end_time in windows:
        cursor = day_epoch(day, start_time)
        day_end = day_epoch(day, end_time)
        step = SLOT_MINUTES * 60
        while cursor + step <= day_end:
            slot_end = cursor + step
            slot: dict = {
                "start": _iso(cursor),
                "end": _iso(slot_end),
                "start_epoch": cursor,
                "end_epoch": slot_end,
                "status": "free",
                "appointment_id": None,
                "patient_id": None,
                "reason": None,
            }
            for b_start, b_end in partial_blocks:
                if cursor < b_end and b_start < slot_end:
                    slot["status"] = "blocked"
                    slot["reason"] = "blocked"
                    break
            if slot["status"] == "free":
                for b_start, b_end, appt in booked_ranges:
                    if cursor < b_end and b_start < slot_end:
                        slot["status"] = "booked"
                        slot["appointment_id"] = appt["id"]
                        slot["patient_id"] = appt["patient_id"]
                        slot["reason"] = appt["reason"]
                        break
            slots.append(slot)
            cursor = slot_end
    return slots


def _appt_end(row: sqlite3.Row) -> int:
    if row["scheduled_end"] is not None:
        return int(row["scheduled_end"])
    return int(row["scheduled_at"]) + int(row["duration_minutes"] or 30) * 60


def _iso(epoch: int) -> str:
    return datetime.fromtimestamp(epoch, UTC).isoformat().replace("+00:00", "Z")


def is_doctor_available(
    doctor_id: int, start: int, end: int, conn: sqlite3.Connection | None = None
) -> bool:
    """Return True when [start, end) sits inside a working window and is free.

    Hard gate used by booking: off-day, blocked day, out-of-hours and
    overlapping existing appointments all return False.
    """
    if end <= start:
        return False
    day = datetime.fromtimestamp(start, UTC).date()
    if day != datetime.fromtimestamp(end - 1, UTC).date():
        return False  # booking spans midnight -> reject (no cross-day slots)

    if conn is not None:
        return _available_with_conn(conn, doctor_id, start, end, day)

    from app.db import get_db

    with get_db() as db:
        return _available_with_conn(db, doctor_id, start, end, day)


def within_working_hours(
    conn: sqlite3.Connection, doctor_id: int, start: int, end: int
) -> bool:
    """True when [start, end) fits a working window on a non-blocked day.

    Excludes the conflict check so callers can report a precise 409 reason
    (off-hours/blocked vs overlapping appointment).
    """
    day = datetime.fromtimestamp(start, UTC).date()
    if is_blocked_day(conn, doctor_id, day):
        return False
    windows = _windows_for(conn, doctor_id, day.weekday())
    return any(
        day_epoch(day, w_start) <= start and end <= day_epoch(day, w_end)
        for w_start, w_end in windows
    )


def _available_with_conn(
    conn: sqlite3.Connection, doctor_id: int, start: int, end: int, day: date
) -> bool:
    if is_blocked_day(conn, doctor_id, day):
        return False
    windows = _windows_for(conn, doctor_id, day.weekday())
    inside = any(
        day_epoch(day, w_start) <= start and end <= day_epoch(day, w_end)
        for w_start, w_end in windows
    )
    if not inside:
        return False
    if find_doctor_conflict(conn, doctor_id, start, end) is not None:
        return False
    return True
