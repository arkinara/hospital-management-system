"""Append-only audit log helper.

Every security-relevant action (login, logout, refresh rotation, permission
updates, user create/update/deactivate, password change) writes one row here.
Maps to the shared `audit_log` table; the entity columns are reused as the
`target_type`/`target_id`/`metadata` triple from the auth spec.
"""

from __future__ import annotations

import json
import time

from app.db import get_db


def write_audit(
    actor_user_id: int | None,
    action: str,
    target_type: str | None = None,
    target_id: str | int | None = None,
    metadata: dict | None = None,
    conn=None,
) -> None:
    """Insert one audit_log row. Never raises (auditing must not fail requests).

    `conn` lets callers share the caller's transaction (avoids SQLite busy
    locks when the caller holds an open write transaction); otherwise a
    short-lived connection is opened.
    """
    try:
        values = (
            actor_user_id,
            action,
            target_type,
            str(target_id) if target_id is not None else None,
            json.dumps(metadata) if metadata is not None else None,
            int(time.time()),
        )
        if conn is not None:
            conn.execute(
                "INSERT INTO audit_log "
                "(actor_user_id, action, entity_type, entity_id, after_json, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                values,
            )
            return
        with get_db() as db:
            db.execute(
                "INSERT INTO audit_log "
                "(actor_user_id, action, entity_type, entity_id, after_json, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                values,
            )
    except Exception:  # pragma: no cover - defensive, never break the caller
        pass
