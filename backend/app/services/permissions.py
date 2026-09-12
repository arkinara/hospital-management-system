"""Permission dependency rule (ticket #55).

The permission matrix stores five flags per role × module: `allowed`
(gate), `can_view`, `can_create`, `can_edit`, `can_delete`. These form a
dependency chain: you cannot create/edit/delete what you cannot view, so a
grant of any write flag implies the view flag.

The admin UI and the audit trail both rely on this invariant. These pure
helpers define it once so it can be unit-tested and reused:
- granting a write flag also grants view,
- revoking view revokes every dependent flag.
"""

from __future__ import annotations

from typing import TypedDict


class PermissionFlags(TypedDict, total=False):
    allowed: bool
    can_view: bool
    can_create: bool
    can_edit: bool
    can_delete: bool


WRITE_FLAGS = ("can_create", "can_edit", "can_delete")


def depends_on(write_flag: str) -> str:
    """The view flag a write flag depends on (all writes imply view)."""
    if write_flag not in WRITE_FLAGS:
        raise ValueError(f"unknown permission flag: {write_flag}")
    return "can_view"


def grant(flags: PermissionFlags, flag: str, value: bool = True) -> PermissionFlags:
    """Return the flags after granting `flag`, with dependency closure applied.

    Granting a write flag implies granting `can_view`. Granting view alone
    leaves writes untouched.
    """
    result: PermissionFlags = dict(flags)
    result[flag] = bool(value)
    if flag in WRITE_FLAGS and value:
        result["can_view"] = True
    return result


def revoke(flags: PermissionFlags, flag: str) -> PermissionFlags:
    """Return the flags after revoking `flag`, with dependency closure applied.

    Revoking `can_view` revokes every write flag too. Revoking a single write
    flag leaves view and the other write flags intact.
    """
    result: PermissionFlags = dict(flags)
    result[flag] = False
    if flag == "can_view":
        for write_flag in WRITE_FLAGS:
            result[write_flag] = False
    return result


def is_consistent(flags: PermissionFlags) -> bool:
    """True when no write flag is granted without its view dependency."""
    if flags.get("can_view", False):
        return True
    return not any(flags.get(flag, False) for flag in WRITE_FLAGS)
