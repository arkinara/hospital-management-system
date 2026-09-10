"""Shared auth dependencies.

Every domain router that needs auth imports `get_current_user`, a
`require_role(...)`/`require_permission(...)` factory, or one of the
convenience wrappers (`require_admin`, `require_doctor_or_admin`, ...).
A request that fails authentication is 401; one that lacks the role or
permission is 403. Permissions read the seeded `permission_matrix`; a
role×module combination missing from the matrix defaults to deny.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db import get_db
from app.security import decode_access_token

ROLES: tuple[str, ...] = ("admin", "doctor", "nurse", "receptionist")

MODULES: tuple[str, ...] = (
    "patients",
    "appointments",
    "records",
    "billing",
    "admin",
    "widget-config",
    "audit",
)

bearer_scheme = HTTPBearer(auto_error=False)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _forbidden() -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    """Resolve the caller from a Bearer access token or raise 401."""
    if credentials is None:
        raise _unauthorized()
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Access token expired") from None
    except jwt.PyJWTError:
        raise _unauthorized() from None

    user_id = int(payload.get("sub", 0))
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, email, full_name, role, department_id, is_active FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    if row is None or not row["is_active"]:
        raise _unauthorized()
    return dict(row)


def require_role(*allowed: str) -> Callable[..., dict[str, Any]]:
    """Return a dependency that admits only the given roles."""

    def dependency(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        if user["role"] not in allowed:
            raise _forbidden()
        return user

    return dependency


def require_permission(module: str) -> Callable[..., dict[str, Any]]:
    """Return a dependency that admits the caller only if the matrix allows them."""

    def dependency(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        with get_db() as conn:
            row = conn.execute(
                "SELECT allowed FROM permission_matrix WHERE role = ? AND module = ?",
                (user["role"], module),
            ).fetchone()
        if row is None or not row["allowed"]:
            raise _forbidden()
        return user

    return dependency


require_admin = require_role("admin")
require_doctor_or_admin = require_role("doctor", "admin")
require_nurse_or_admin = require_role("nurse", "admin")
require_staff = require_role("admin", "doctor", "nurse", "receptionist")
