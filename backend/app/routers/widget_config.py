"""Widget config domain router (ticket #24).

Per-user dashboard layout (ordered list of widget IDs) + admin global lock
enforcement. Locked widgets cannot be removed or disabled by the end user.
"""
from __future__ import annotations

import sqlite3
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.audit import write_audit
from app.db import get_db as get_conn
from app.dependencies import require_admin, require_role
from app.services.widget_lock import resolve_layout

router = APIRouter(prefix="/widget-config", tags=["widget-config"])


class LayoutItem(BaseModel):
    widget_id: int
    position_order: int = Field(ge=0)
    enabled: bool = True
    size: str = "medium"  # small | medium | large


class LayoutIn(BaseModel):
    items: list[LayoutItem]


class WidgetLockIn(BaseModel):
    globally_locked: bool


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {k: row[k] for k in row.keys()}


def _table_cols(conn, table: str) -> set[str]:
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}


# ---------------------------------------------------------------------------
# Catalog (widget definitions)
# ---------------------------------------------------------------------------


@router.get("/widgets")
def list_widgets(
    _user=Depends(require_role("admin", "doctor", "nurse", "receptionist")),
) -> dict:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM widget_definitions ORDER BY id"
        ).fetchall()
    return {"widgets": [_row_to_dict(r) for r in rows]}


@router.get("/widgets/admin/library")
def admin_widget_library(
    _user=Depends(require_admin),
) -> dict:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM widget_definitions ORDER BY id").fetchall()
    return {"widgets": [_row_to_dict(r) for r in rows]}


@router.patch("/widgets/{widget_id}/lock")
def set_widget_lock(
    widget_id: int,
    body: WidgetLockIn,
    user=Depends(require_admin),
) -> dict:
    actor = user["id"]
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM widget_definitions WHERE id = ?", [widget_id]
        ).fetchone()
        if not row:
            raise HTTPException(404, "Widget not found")
        conn.execute(
            "UPDATE widget_definitions SET globally_locked = ? WHERE id = ?",
            [int(body.globally_locked), widget_id],
        )
        write_audit(conn=conn, actor_user_id=actor, action="widget.lock_toggle",
                    target_type="widget", target_id=widget_id,
                    metadata={"globally_locked": body.globally_locked})
        row = conn.execute("SELECT * FROM widget_definitions WHERE id = ?", [widget_id]).fetchone()
    return _row_to_dict(row)


# ---------------------------------------------------------------------------
# Per-user layout
# ---------------------------------------------------------------------------


@router.get("/me")
def get_my_layout(
    user=Depends(require_role("admin", "doctor", "nurse", "receptionist")),
) -> dict:
    return {"user_id": user["id"], "items": _get_layout(user["id"])}


@router.put("/me")
def save_my_layout(
    body: LayoutIn,
    user=Depends(require_role("admin", "doctor", "nurse", "receptionist")),
) -> dict:
    user_id = user["id"]
    with get_conn() as conn:
        # Enforce global locks: locked widgets stay enabled at admin's chosen
        # position; user cannot disable or remove them.
        locked_ids = {
            r["id"] for r in conn.execute(
                "SELECT id FROM widget_definitions WHERE globally_locked = 1"
            ).fetchall()
        }
        valid_widget_ids = {
            r["id"] for r in conn.execute("SELECT id FROM widget_definitions").fetchall()
        }
        for item in body.items:
            if item.widget_id not in valid_widget_ids:
                raise HTTPException(400, f"Unknown widget_id {item.widget_id}")
        # Wipe + replace with the lock-resolved layout.
        resolved = resolve_layout(
            [
                {
                    "widget_id": item.widget_id,
                    "position_order": item.position_order,
                    "enabled": item.enabled,
                    "size": item.size,
                }
                for item in body.items
            ],
            locked_ids,
        )
        conn.execute("DELETE FROM user_widget_layout WHERE user_id = ?", [user_id])
        inserted = 0
        for item in resolved:
            cur = conn.execute(
                "INSERT INTO user_widget_layout (user_id, widget_id, position_order, enabled, size) "
                "VALUES (?, ?, ?, ?, ?)",
                [user_id, item["widget_id"], item["position_order"],
                 int(item["enabled"]), item["size"]],
            )
            inserted += cur.rowcount
        write_audit(conn=conn, actor_user_id=user_id, action="widget.layout_save",
                    target_type="user_widget_layout", target_id=user_id,
                    metadata={"items": len(body.items), "inserted": inserted})
    return {"user_id": user_id, "items": _get_layout(user_id)}


@router.delete("/me/{widget_id}", status_code=204)
def remove_widget(
    widget_id: int,
    user=Depends(require_role("admin", "doctor", "nurse", "receptionist")),
) -> None:
    user_id = user["id"]
    with get_conn() as conn:
        locked = conn.execute(
            "SELECT 1 FROM widget_definitions WHERE id = ? AND globally_locked = 1",
            [widget_id],
        ).fetchone()
        if locked:
            raise HTTPException(403, "Widget is globally locked and cannot be removed")
        conn.execute(
            "DELETE FROM user_widget_layout WHERE user_id = ? AND widget_id = ?",
            [user_id, widget_id],
        )
        write_audit(conn=conn, actor_user_id=user_id, action="widget.remove",
                    target_type="user_widget_layout", target_id=widget_id)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _get_layout(user_id: int) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT uwl.widget_id, uwl.position_order, uwl.enabled, uwl.size, "
            "wd.key, wd.name, wd.globally_locked "
            "FROM user_widget_layout uwl "
            "JOIN widget_definitions wd ON wd.id = uwl.widget_id "
            "WHERE uwl.user_id = ? ORDER BY uwl.position_order",
            [user_id],
        ).fetchall()
    return [_row_to_dict(r) for r in rows]