"""Widget lock resolution (ticket #55, extracted from #24).

Admins can lock widgets globally. Locked widgets are a hard guarantee to the
end user's layout:
- they cannot be removed (omitting one from a saved layout re-adds it), and
- they cannot be disabled (the user's `enabled` flag is forced back on).

`resolve_layout` takes the layout the user submitted and the set of locked
widget ids, and returns the layout that must be persisted.
"""

from __future__ import annotations

from typing import Any

END_OF_LIST_POSITION = 9999


def _clean_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "widget_id": item["widget_id"],
        "position_order": item.get("position_order", END_OF_LIST_POSITION),
        "enabled": bool(item.get("enabled", True)),
        "size": item.get("size", "medium"),
    }


def resolve_layout(submitted: list[dict[str, Any]], locked_ids: set[int]) -> list[dict[str, Any]]:
    """Return the canonical layout after lock enforcement.

    Rules:
    1. A locked widget submitted by the user stays enabled and keeps its
       submitted position.
    2. A locked widget the user omitted is re-added at the end of the list,
       enabled.
    3. Unlocked widgets pass through untouched.
    """
    locked = {int(i) for i in locked_ids}
    resolved: list[dict[str, Any]] = []
    submitted_ids: set[int] = set()

    for item in submitted:
        cleaned = _clean_item(item)
        widget_id = int(cleaned["widget_id"])
        submitted_ids.add(widget_id)
        if widget_id in locked:
            cleaned["enabled"] = True
        resolved.append(cleaned)

    for widget_id in sorted(locked - submitted_ids):
        resolved.append(
            {
                "widget_id": widget_id,
                "position_order": END_OF_LIST_POSITION,
                "enabled": True,
                "size": "medium",
            }
        )
    return resolved


def can_remove(widget_id: int, locked_ids: set[int]) -> bool:
    """A locked widget may never be removed from a personal layout."""
    return int(widget_id) not in {int(i) for i in locked_ids}
