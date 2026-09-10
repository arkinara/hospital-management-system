"""Auth domain router — Better Auth login/session, RBAC matrix, admin user mgmt.

Endpoints:
- POST /auth/login            email/password -> access + refresh + user
- POST /auth/logout           revoke a refresh token (idempotent, 204)
- POST /auth/refresh          rotate a refresh token (old is revoked)
- GET  /auth/me               current user + role + permission matrix
- POST /auth/forgot-password  always 204; creates a password_resets row if the email exists
- POST /auth/reset-password   consume a reset token to set a new password
- POST /auth/change-password  authenticated password change
- Admin-only: GET/PUT /auth/permissions, POST/GET /auth/users,
  PATCH /auth/users/{id}, POST /auth/users/{id}/deactivate

No public self-signup exists: staff accounts are provisioned by an Admin only
(PRD: Authentication & RBAC).
"""

from __future__ import annotations

import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field

from app.audit import write_audit
from app.config import get_settings
from app.db import get_db
from app.dependencies import MODULES, ROLES, get_current_user, require_admin
from app.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

RoleLiteral = Literal["admin", "doctor", "nurse", "receptionist"]
ModuleLiteral = Literal[
    "patients",
    "appointments",
    "records",
    "billing",
    "admin",
    "widget-config",
    "audit",
]

RESET_TOKEN_TTL_SECONDS = 3600  # 1h


class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class PermissionUpdateRequest(BaseModel):
    allowed: bool


class UserCreateRequest(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    email: str
    password: str = Field(min_length=8)
    full_name: str
    role: RoleLiteral
    department_id: int | None = None


class UserUpdateRequest(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    role: RoleLiteral | None = None
    department_id: int | None = None
    is_active: bool | None = None


def _user_payload(row) -> dict:
    return {
        "id": row["id"],
        "full_name": row["full_name"],
        "role": row["role"],
        "department_id": row["department_id"],
    }


def _insert_session(conn, user_id: int, refresh_token: str) -> dict:
    settings = get_settings()
    now = int(time.time())
    expires_at = now + settings.refresh_token_ttl_days * 86400
    refresh_hash = hash_refresh_token(refresh_token)
    conn.execute(
        "INSERT INTO sessions "
        "(user_id, token, refresh_token_hash, expires_at, created_at, last_used_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, refresh_hash, refresh_hash, expires_at, now, now),
    )
    return {"refresh_token": refresh_token, "expires_at": expires_at}


def _client_context(request: Request) -> tuple[str, str]:
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    return ip, user_agent


@router.post("/login", status_code=status.HTTP_200_OK)
async def login(request: Request, body: LoginRequest) -> dict:
    with get_db() as conn:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (body.email,)).fetchone()
    if user is None:
        write_audit(None, "login.failed", "user", None, {"email": body.email})
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(body.password, user["password_hash"]):
        write_audit(user["id"], "login.failed", "user", user["id"], {"email": body.email})
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    refresh_token = create_refresh_token()
    with get_db() as conn:
        _insert_session(conn, user["id"], refresh_token)
        conn.execute(
            "UPDATE users SET last_login_at = ? WHERE id = ?",
            (int(time.time()), user["id"]),
        )
    ip, ua = _client_context(request)
    write_audit(user["id"], "login.success", "user", user["id"], {"email": body.email, "ip": ip})

    return {
        "access_token": create_access_token(user["id"], user["role"]),
        "refresh_token": refresh_token,
        "user": _user_payload(user),
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, body: RefreshRequest) -> None:
    refresh_hash = hash_refresh_token(body.refresh_token)
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, user_id FROM sessions WHERE refresh_token_hash = ?",
            (refresh_hash,),
        ).fetchone()
        if row is not None:
            conn.execute(
                "UPDATE sessions SET revoked_at = ? WHERE id = ?",
                (int(time.time()), row["id"]),
            )
    if row is not None:
        ip, ua = _client_context(request)
        write_audit(row["user_id"], "logout", "session", row["id"], {"ip": ip})
    return None


@router.post("/refresh", status_code=status.HTTP_200_OK)
async def refresh(request: Request, body: RefreshRequest) -> dict:
    refresh_hash = hash_refresh_token(body.refresh_token)
    now = int(time.time())
    with get_db() as conn:
        session = conn.execute(
            "SELECT s.id, s.user_id, s.expires_at, u.role, u.is_active "
            "FROM sessions s JOIN users u ON u.id = s.user_id "
            "WHERE s.refresh_token_hash = ? AND s.revoked_at IS NULL",
            (refresh_hash,),
        ).fetchone()
        if session is None or session["expires_at"] <= now or not session["is_active"]:
            write_audit(
                session["user_id"] if session else None,
                "refresh.rejected",
                "session",
                session["id"] if session else None,
            )
            raise HTTPException(status_code=401, detail="Refresh token invalid")

        conn.execute("UPDATE sessions SET revoked_at = ? WHERE id = ?", (now, session["id"]))

        new_refresh = create_refresh_token()
        _insert_session(conn, session["user_id"], new_refresh)
        user_row = conn.execute(
            "SELECT id, full_name, role, department_id FROM users WHERE id = ?",
            (session["user_id"],),
        ).fetchone()
    ip, ua = _client_context(request)
    write_audit(
        session["user_id"],
        "refresh.rotate",
        "session",
        session["id"],
        {"ip": ip},
    )
    return {
        "access_token": create_access_token(session["user_id"], session["role"]),
        "refresh_token": new_refresh,
        "user": _user_payload(user_row),
    }


@router.get("/me", status_code=status.HTTP_200_OK)
async def me(user: dict = Depends(get_current_user)) -> dict:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT module, allowed FROM permission_matrix WHERE role = ? ORDER BY module",
            (user["role"],),
        ).fetchall()
    return {
        "id": user["id"],
        "email": user["email"],
        "full_name": user["full_name"],
        "role": user["role"],
        "department_id": user["department_id"],
        "permissions": [{"module": r["module"], "allowed": bool(r["allowed"])} for r in rows],
    }


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
async def forgot_password(body: ForgotPasswordRequest) -> None:
    """Always 204 so we never leak whether an email is registered."""
    with get_db() as conn:
        user = conn.execute("SELECT id FROM users WHERE email = ?", (body.email,)).fetchone()
    if user is not None:
        token = create_refresh_token()
        token_hash = hash_refresh_token(token)
        expires_at = int(time.time()) + RESET_TOKEN_TTL_SECONDS
        with get_db() as conn:
            conn.execute(
                "INSERT INTO password_resets (user_id, token_hash, expires_at, created_at) "
                "VALUES (?, ?, ?, ?)",
                (user["id"], token_hash, expires_at, int(time.time())),
            )
        # Stub delivery: in dev we log the reset link. Swap for real email in prod.
        print(f"[auth] password reset link for {body.email}: /reset?token={token}")
        write_audit(user["id"], "password.reset_requested", "user", user["id"])
    return None


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(body: ResetPasswordRequest) -> None:
    token_hash = hash_refresh_token(body.token)
    now = int(time.time())
    with get_db() as conn:
        reset = conn.execute(
            "SELECT id, user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?",
            (token_hash,),
        ).fetchone()
        if reset is None or reset["used_at"] is not None or reset["expires_at"] <= now:
            raise HTTPException(status_code=400, detail="Invalid or expired token")
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(body.new_password), reset["user_id"]),
        )
        conn.execute("UPDATE password_resets SET used_at = ? WHERE id = ?", (now, reset["id"]))
    write_audit(reset["user_id"], "password.reset", "user", reset["user_id"])
    return None


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordRequest, user: dict = Depends(get_current_user)
) -> None:
    with get_db() as conn:
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
    if not verify_password(body.current_password, row["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(body.new_password), user["id"]),
        )
    write_audit(user["id"], "password.change", "user", user["id"])
    return None


# ---- Admin-only: permission matrix + user management -----------------------


@router.get("/permissions", status_code=status.HTTP_200_OK)
async def list_permissions(_user: dict = Depends(require_admin)) -> dict:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT role, module, allowed FROM permission_matrix ORDER BY role, module"
        ).fetchall()
    return {"permissions": [dict(r) | {"allowed": bool(r["allowed"])} for r in rows]}


@router.put("/permissions/{role}/{module}", status_code=status.HTTP_200_OK)
async def update_permission(
    role: str, module: str, body: PermissionUpdateRequest, user: dict = Depends(require_admin)
) -> dict:
    if role not in ROLES or module not in MODULES:
        raise HTTPException(status_code=422, detail="Unknown role or module")
    allowed = int(body.allowed)
    with get_db() as conn:
        conn.execute(
            "INSERT INTO permission_matrix (role, module, allowed, can_view) "
            "VALUES (?, ?, ?, ?) "
            "ON CONFLICT(role, module) DO UPDATE SET allowed = excluded.allowed",
            (role, module, allowed, allowed),
        )
    write_audit(
        user["id"],
        "permission.update",
        "permission_matrix",
        f"{role}/{module}",
        {"allowed": body.allowed},
    )
    return {"role": role, "module": module, "allowed": body.allowed}


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(body: UserCreateRequest, user: dict = Depends(require_admin)) -> dict:
    with get_db() as conn:
        exists = conn.execute("SELECT id FROM users WHERE email = ?", (body.email,)).fetchone()
        if exists is not None:
            raise HTTPException(status_code=409, detail="Email already registered")
        cursor = conn.execute(
            "INSERT INTO users (email, password_hash, full_name, role, department_id, "
            "is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
            (
                body.email,
                hash_password(body.password),
                body.full_name,
                body.role,
                body.department_id,
                int(time.time()),
            ),
        )
        new_id = cursor.lastrowid
    write_audit(user["id"], "user.create", "user", new_id, {"role": body.role})
    return {"id": new_id, "email": body.email, "full_name": body.full_name, "role": body.role}


@router.get("/users", status_code=status.HTTP_200_OK)
async def list_users(_user: dict = Depends(require_admin)) -> dict:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, email, full_name, role, department_id, is_active, created_at "
            "FROM users ORDER BY id"
        ).fetchall()
    return {"users": [dict(r) | {"is_active": bool(r["is_active"])} for r in rows]}


@router.patch("/users/{user_id}", status_code=status.HTTP_200_OK)
async def update_user(
    user_id: int, body: UserUpdateRequest, user: dict = Depends(require_admin)
) -> dict:
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id, role, department_id, is_active FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="User not found")
        new_role = body.role if body.role is not None else existing["role"]
        new_dept = (
            body.department_id
            if "department_id" in body.model_fields_set
            else existing["department_id"]
        )
        new_active = int(body.is_active) if body.is_active is not None else existing["is_active"]
        conn.execute(
            "UPDATE users SET role = ?, department_id = ?, is_active = ?, updated_at = ? "
            "WHERE id = ?",
            (new_role, new_dept, new_active, int(time.time()), user_id),
        )
        if not new_active:
            conn.execute(
                "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
                (int(time.time()), user_id),
            )
    write_audit(
        user["id"],
        "user.update",
        "user",
        user_id,
        {"role": new_role, "is_active": bool(new_active)},
    )
    return {
        "id": user_id,
        "role": new_role,
        "department_id": new_dept,
        "is_active": bool(new_active),
    }


@router.post("/users/{user_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(user_id: int, user: dict = Depends(require_admin)) -> None:
    now = int(time.time())
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="User not found")
        conn.execute("UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?", (now, user_id))
        conn.execute(
            "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
            (now, user_id),
        )
    write_audit(user["id"], "user.deactivate", "user", user_id)
    return None
