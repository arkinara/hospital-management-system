"""Audit log router (ticket #46).

Append-only audit log. Writers go through `app.audit.write_audit()` from any
domain. This router exposes a single admin-only read endpoint with filters and
pagination.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from app.db import get_db as get_conn
from app.dependencies import require_admin

router = APIRouter(prefix="/audit", tags=["audit"])


def _row_to_dict(row: sqlite3.Row) -> dict:
    out = {k: row[k] for k in row.keys()}
    # Parse after_json if present
    if "after_json" in out and out["after_json"]:
        try:
            out["metadata"] = json.loads(out["after_json"])
        except (TypeError, ValueError):
            out["metadata"] = None
        out.pop("after_json", None)
    if "before_json" in out and out["before_json"]:
        try:
            out["before"] = json.loads(out["before_json"])
        except (TypeError, ValueError):
            out["before"] = None
        out.pop("before_json", None)
    return out


def _parse_iso(s: str) -> int:
    return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())


@router.get("/log")
def list_audit_entries(
    action: str | None = Query(None, description="Filter by action prefix, e.g. 'patient.'"),
    target_type: str | None = Query(None, alias="target_type",
                                     description="Filter by entity_type, e.g. 'patient'"),
    target_id: str | None = Query(None, description="Filter by entity_id (string or int)"),
    actor_user_id: int | None = Query(None),
    from_: str | None = Query(None, alias="from", description="ISO timestamp lower bound"),
    to: str | None = Query(None, description="ISO timestamp upper bound"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _user=Depends(require_admin),
) -> dict:
    where, params = [], []
    if action:
        where.append("action LIKE ?"); params.append(f"{action}%")
    if target_type:
        where.append("entity_type = ?"); params.append(target_type)
    if target_id:
        where.append("entity_id = ?"); params.append(str(target_id))
    if actor_user_id:
        where.append("actor_user_id = ?"); params.append(actor_user_id)
    if from_:
        where.append("created_at >= ?"); params.append(_parse_iso(from_))
    if to:
        where.append("created_at <= ?"); params.append(_parse_iso(to))
    sql = "SELECT * FROM audit_log"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
        count_sql = "SELECT COUNT(*) AS c FROM audit_log"
        if where:
            count_sql += " WHERE " + " AND ".join(where)
        total = conn.execute(count_sql, params[:-2]).fetchone()["c"]
    return {"total": total, "limit": limit, "offset": offset, "entries": [_row_to_dict(r) for r in rows]}


@router.get("/log/{entry_id}")
def get_audit_entry(
    entry_id: int,
    _user=Depends(require_admin),
) -> dict:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM audit_log WHERE id = ?", [entry_id]).fetchone()
    if not row:
        raise HTTPException(404, "Audit entry not found")
    return _row_to_dict(row)


@router.get("/actions")
def list_known_actions(
    _user=Depends(require_admin),
) -> dict:
    """Distinct actions recorded so far. Useful for building admin filters."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT action, COUNT(*) AS c FROM audit_log "
            "GROUP BY action ORDER BY action"
        ).fetchall()
    return {"actions": [{"action": r["action"], "count": r["c"]} for r in rows]}