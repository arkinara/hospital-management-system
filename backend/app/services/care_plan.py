"""Care-plan priority ordering (ticket #55).

Care plan items carry a `priority` string; when a department lists or hands
over a plan the items render in priority order, most urgent first. Items with
an unknown priority sort last so a data typo can never push a critical item
below a routine one.
"""

from __future__ import annotations

from typing import Any

PRIORITY_ORDER: dict[str, int] = {
    "critical": 0,
    "urgent": 1,
    "high": 2,
    "normal": 3,
    "low": 4,
}

DEFAULT_RANK = len(PRIORITY_ORDER) + 1


def priority_rank(priority: str | None) -> int:
    """Rank a priority label; unknown/None labels sort after every known one."""
    if not priority:
        return DEFAULT_RANK
    return PRIORITY_ORDER.get(priority.lower(), DEFAULT_RANK)


def sort_by_priority(items: list[dict[str, Any]], key: str = "priority") -> list[dict[str, Any]]:
    """Stable-sort care-plan items by priority rank, most urgent first.

    Only the priority field determines order, so two items with the same
    priority keep their input order (stable sort).
    """
    return sorted(items, key=lambda item: priority_rank(item.get(key)))
