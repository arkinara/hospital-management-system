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
) -> None:
    """Insert one audit_log row. Never raises (auditing must not fail requests)."""
    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO audit_log "
                "(actor_user_id, action, entity_type, entity_id, after_json, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    actor_user_id,
                    action,
                    target_type,
                    str(target_id) if target_id is not None else None,
                    json.dumps(metadata) if metadata is not None else None,
                    int(time.time()),
                ),
            )
    except Exception:  # pragma: no cover - defensive, never break the caller
        pass
