"""Login rate limiting and temporary lockout, backed by the audit log.

The login handler writes a `login.failed` audit row (carrying the normalised
email and the client IP in its metadata) on every rejected attempt. This module
reads those rows to decide whether an email or an IP is currently locked out,
so the throttle reuses the durable forensic signal that is already emitted.

Emails are normalised (lowercased + stripped) before they are counted, so
`Admin@hospital.test` and ` admin@hospital.test ` share one bucket.
"""

from __future__ import annotations

import json
import time

from fastapi import Request

from app.config import get_settings
from app.db import get_db

FAILED_ACTION = "login.failed"


def normalize_email(email: str | None) -> str:
    """Canonical form used for storage, comparison and lockout bucketing."""
    return (email or "").strip().lower()


def get_client_ip(request: Request) -> str | None:
    """Return the caller IP, honouring `X-Forwarded-For` when behind a proxy."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else None


def _now() -> int:
    return int(time.time())


def _parse_meta(raw: str | None) -> dict:
    try:
        meta = json.loads(raw) if raw else {}
    except (TypeError, ValueError):
        return {}
    return meta if isinstance(meta, dict) else {}


def _failure_rows(now: int, window_seconds: int) -> list[dict]:
    """All `login.failed` rows inside the window, with parsed metadata."""
    since = now - window_seconds
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, after_json, created_at FROM audit_log WHERE action = ? AND created_at >= ?",
            (FAILED_ACTION, since),
        ).fetchall()
    parsed = []
    for row in rows:
        meta = _parse_meta(row["after_json"])
        parsed.append(
            {
                "id": row["id"],
                "email": normalize_email(meta.get("email")),
                "ip": meta.get("ip"),
                "created_at": row["created_at"],
            }
        )
    return parsed


def _remaining_cooldown(hits: list[dict], now: int, cooldown_seconds: int) -> int:
    if not hits:
        return 0
    latest = max(hit["created_at"] for hit in hits)
    return max(0, cooldown_seconds - (now - latest))


def count_failures(email: str, window_seconds: int, *, now: int | None = None) -> int:
    """Number of failed logins for a normalised email within the window."""
    ts = _now() if now is None else now
    target = normalize_email(email)
    if not target:
        return 0
    return sum(1 for row in _failure_rows(ts, window_seconds) if row["email"] == target)


def count_failures_by_ip(ip: str | None, window_seconds: int, *, now: int | None = None) -> int:
    """Number of failed logins from a client IP within the window."""
    if not ip:
        return 0
    ts = _now() if now is None else now
    return sum(1 for row in _failure_rows(ts, window_seconds) if row["ip"] == ip)


def is_locked(email: str | None, ip: str | None) -> bool:
    """True when the email or IP has crossed its failure threshold.

    A lock is active while at least the threshold number of failures fall in the
    rolling window and the cooldown measured from the most recent one has not
    elapsed; once the window rolls past them the count drops and the lock
    clears without any background job.
    """
    settings = get_settings()
    now = _now()
    window = settings.auth_lockout_window_seconds
    cooldown = settings.auth_lockout_cooldown_seconds
    rows = _failure_rows(now, window)

    target = normalize_email(email)
    if target:
        email_hits = [row for row in rows if row["email"] == target]
        if len(email_hits) >= settings.auth_max_attempts_per_email:
            if _remaining_cooldown(email_hits, now, cooldown) > 0:
                return True

    if ip:
        ip_hits = [row for row in rows if row["ip"] == ip]
        if len(ip_hits) >= settings.auth_max_attempts_per_ip:
            if _remaining_cooldown(ip_hits, now, cooldown) > 0:
                return True

    return False


def record_success(email: str | None, ip: str | None) -> None:
    """Clear recent failures for an email after a successful login.

    Only `login.failed` rows for the normalised email inside the current window
    are removed; everything else stays in the append-only trail.
    """
    target = normalize_email(email)
    if not target:
        return
    settings = get_settings()
    now = _now()
    rows = _failure_rows(now, settings.auth_lockout_window_seconds)
    stale_ids = [row["id"] for row in rows if row["email"] == target]
    if not stale_ids:
        return
    with get_db() as conn:
        conn.executemany("DELETE FROM audit_log WHERE id = ?", [(row_id,) for row_id in stale_ids])


def locked_accounts() -> list[dict]:
    """Email buckets currently locked out, for the admin visibility endpoint."""
    settings = get_settings()
    now = _now()
    window = settings.auth_lockout_window_seconds
    cooldown = settings.auth_lockout_cooldown_seconds
    buckets: dict[str, list[dict]] = {}
    for row in _failure_rows(now, window):
        if row["email"]:
            buckets.setdefault(row["email"], []).append(row)

    locked = []
    for email, hits in buckets.items():
        if len(hits) < settings.auth_max_attempts_per_email:
            continue
        remaining = _remaining_cooldown(hits, now, cooldown)
        if remaining <= 0:
            continue
        latest = max(hit["created_at"] for hit in hits)
        locked.append(
            {
                "email": email,
                "attempts": len(hits),
                "locked_until": latest + cooldown,
                "remaining_seconds": remaining,
            }
        )
    locked.sort(key=lambda item: item["email"])
    return locked
