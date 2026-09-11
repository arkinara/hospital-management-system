"""Admin domain router (ticket #23).

User CRUD (admin only), department CRUD, department-staff mapping, role
assignment. Bed capacity already exists on departments; capacity endpoints
are added here for ticket #44 dependency.
"""
from __future__ import annotations

import sqlite3
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.audit import write_audit
from app.db import get_db as get_conn
from app.dependencies import require_admin, require_role
from app.security import hash_password

router = APIRouter(prefix="/admin", tags=["admin"])

VALID_ROLES = {"admin", "doctor", "nurse", "receptionist"}


class UserIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1)
    role: str
    department_id: int | None = None
    specialisation: str | None = None
    is_active: bool = True


class UserPatchIn(BaseModel):
    full_name: str | None = None
    role: str | None = None
    department_id: int | None = None
    specialisation: str | None = None
    is_active: bool | None = None


class DepartmentIn(BaseModel):
    name: str = Field(min_length=1)
    code: str = Field(min_length=1, max_length=10)
    type: str = "general"
    bed_capacity: int = Field(default=0, ge=0)
    min_clinicians_per_shift: int = Field(default=1, ge=0)
    active: bool = True


class DepartmentPatchIn(BaseModel):
    name: str | None = None
    type: str | None = None
    bed_capacity: int | None = Field(default=None, ge=0)
    min_clinicians_per_shift: int | None = Field(default=None, ge=0)
    active: bool | None = None


class StaffAssignIn(BaseModel):
    user_id: int
    department_id: int


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {k: row[k] for k in row.keys()}


def _table_cols(conn, table: str) -> set[str]:
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}


# ---------------------------------------------------------------------------
# User CRUD
# ---------------------------------------------------------------------------


@router.get("/users")
def list_users(
    role: str | None = None,
    department_id: int | None = None,
    _user=Depends(require_admin),
) -> dict:
    where = []
    params: list = []
    if role:
        where.append("role = ?")
        params.append(role)
    if department_id:
        where.append("department_id = ?")
        params.append(department_id)
    sql = "SELECT id, email, full_name, role, department_id, specialisation, is_active, created_at FROM users"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY id"
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return {"users": [_row_to_dict(r) for r in rows]}


@router.get("/users/{user_id}")
def get_user(
    user_id: int,
    _user=Depends(require_admin),
) -> dict:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, email, full_name, role, department_id, specialisation, is_active, "
            "created_at, last_login_at FROM users WHERE id = ?", [user_id]
        ).fetchone()
    if not row:
        raise HTTPException(404, "User not found")
    return _row_to_dict(row)


@router.post("/users", status_code=201)
def create_user(
    body: UserIn,
    user=Depends(require_admin),
) -> dict:
    if body.role not in VALID_ROLES:
        raise HTTPException(400, f"role must be one of {VALID_ROLES}")
    user_id = user["id"]
    pw_hash = hash_password(body.password)
    now = int(datetime.now(UTC).timestamp())
    with get_conn() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO users (email, password_hash, full_name, role, department_id, "
                "specialisation, status, mfa_enabled, last_login_at, is_active, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, 'active', 0, NULL, ?, ?)",
                [body.email, pw_hash, body.full_name, body.role, body.department_id,
                 body.specialisation, int(body.is_active), now],
            )
        except sqlite3.IntegrityError as e:
            raise HTTPException(409, f"Email already exists: {e}")
        new_id = cur.lastrowid
        write_audit(conn=conn, actor_user_id=user_id, action="admin.user_create",
                    target_type="user", target_id=new_id)
        row = conn.execute(
            "SELECT id, email, full_name, role, department_id, specialisation, is_active, created_at "
            "FROM users WHERE id = ?", [new_id]
        ).fetchone()
    return _row_to_dict(row)


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    body: UserPatchIn,
    user=Depends(require_admin),
) -> dict:
    if body.role is not None and body.role not in VALID_ROLES:
        raise HTTPException(400, f"role must be one of {VALID_ROLES}")
    actor = user["id"]
    with get_conn() as conn:
        existing = conn.execute("SELECT id FROM users WHERE id = ?", [user_id]).fetchone()
        if not existing:
            raise HTTPException(404, "User not found")
        sets, params = [], []
        if body.full_name is not None:
            sets.append("full_name = ?"); params.append(body.full_name)
        if body.role is not None:
            sets.append("role = ?"); params.append(body.role)
        if body.department_id is not None:
            sets.append("department_id = ?"); params.append(body.department_id)
        if body.specialisation is not None:
            sets.append("specialisation = ?"); params.append(body.specialisation)
        if body.is_active is not None:
            sets.append("is_active = ?"); params.append(int(body.is_active))
        if sets:
            cols = _table_cols(conn, "users")
            if "updated_at" in cols:
                sets.append("updated_at = ?"); params.append(int(datetime.now(UTC).timestamp()))
            params.append(user_id)
            conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ?", params)
        write_audit(conn=conn, actor_user_id=actor, action="admin.user_update",
                    target_type="user", target_id=user_id)
        row = conn.execute(
            "SELECT id, email, full_name, role, department_id, specialisation, is_active, created_at "
            "FROM users WHERE id = ?", [user_id]
        ).fetchone()
    return _row_to_dict(row)


@router.post("/users/{user_id}/deactivate", status_code=204)
def deactivate_user(
    user_id: int,
    user=Depends(require_admin),
) -> None:
    actor = user["id"]
    now = int(datetime.now(UTC).timestamp())
    with get_conn() as conn:
        existing = conn.execute("SELECT id FROM users WHERE id = ?", [user_id]).fetchone()
        if not existing:
            raise HTTPException(404, "User not found")
        cols = _table_cols(conn, "users")
        if "is_active" in cols:
            conn.execute("UPDATE users SET is_active = 0 WHERE id = ?", [user_id])
        if "status" in cols:
            conn.execute("UPDATE users SET status = 'inactive' WHERE id = ?", [user_id])
        if "updated_at" in cols:
            conn.execute("UPDATE users SET updated_at = ? WHERE id = ?", [now, user_id])
        write_audit(conn=conn, actor_user_id=actor, action="admin.user_deactivate",
                    target_type="user", target_id=user_id)


# ---------------------------------------------------------------------------
# Department CRUD
# ---------------------------------------------------------------------------


@router.get("/departments")
def list_departments(
    active: bool | None = None,
    _user=Depends(require_role("admin", "doctor", "nurse", "receptionist")),
) -> dict:
    where, params = [], []
    if active is not None:
        where.append("active = ?")
        params.append(int(active))
    sql = "SELECT * FROM departments"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY name"
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return {"departments": [_row_to_dict(r) for r in rows]}


@router.get("/departments/{dept_id}")
def get_department(
    dept_id: int,
    _user=Depends(require_role("admin", "doctor", "nurse", "receptionist")),
) -> dict:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM departments WHERE id = ?", [dept_id]).fetchone()
    if not row:
        raise HTTPException(404, "Department not found")
    return _row_to_dict(row)


@router.post("/departments", status_code=201)
def create_department(
    body: DepartmentIn,
    user=Depends(require_admin),
) -> dict:
    actor = user["id"]
    now = int(datetime.now(UTC).timestamp())
    with get_conn() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO departments (name, code, type, bed_capacity, "
                "min_clinicians_per_shift, active, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                [body.name, body.code, body.type, body.bed_capacity,
                 body.min_clinicians_per_shift, int(body.active), now],
            )
        except sqlite3.IntegrityError as e:
            raise HTTPException(409, f"Department code already exists: {e}")
        new_id = cur.lastrowid
        write_audit(conn=conn, actor_user_id=actor, action="admin.department_create",
                    target_type="department", target_id=new_id)
        row = conn.execute("SELECT * FROM departments WHERE id = ?", [new_id]).fetchone()
    return _row_to_dict(row)


@router.patch("/departments/{dept_id}")
def update_department(
    dept_id: int,
    body: DepartmentPatchIn,
    user=Depends(require_admin),
) -> dict:
    actor = user["id"]
    with get_conn() as conn:
        existing = conn.execute("SELECT id FROM departments WHERE id = ?", [dept_id]).fetchone()
        if not existing:
            raise HTTPException(404, "Department not found")
        sets, params = [], []
        if body.name is not None:
            sets.append("name = ?"); params.append(body.name)
        if body.type is not None:
            sets.append("type = ?"); params.append(body.type)
        if body.bed_capacity is not None:
            sets.append("bed_capacity = ?"); params.append(body.bed_capacity)
        if body.min_clinicians_per_shift is not None:
            sets.append("min_clinicians_per_shift = ?"); params.append(body.min_clinicians_per_shift)
        if body.active is not None:
            sets.append("active = ?"); params.append(int(body.active))
        if sets:
            params.append(dept_id)
            conn.execute(f"UPDATE departments SET {', '.join(sets)} WHERE id = ?", params)
        write_audit(conn=conn, actor_user_id=actor, action="admin.department_update",
                    target_type="department", target_id=dept_id)
        row = conn.execute("SELECT * FROM departments WHERE id = ?", [dept_id]).fetchone()
    return _row_to_dict(row)


# ---------------------------------------------------------------------------
# Department-staff mapping
# ---------------------------------------------------------------------------


@router.get("/department-staff")
def list_dept_staff(
    department_id: int | None = None,
    user_id: int | None = None,
    _user=Depends(require_role("admin", "doctor", "nurse", "receptionist")),
) -> dict:
    where, params = [], []
    if department_id:
        where.append("department_id = ?"); params.append(department_id)
    if user_id:
        where.append("user_id = ?"); params.append(user_id)
    sql = (
        "SELECT ds.*, u.email, u.full_name, d.name AS department_name "
        "FROM department_staff ds "
        "LEFT JOIN users u ON u.id = ds.user_id "
        "LEFT JOIN departments d ON d.id = ds.department_id"
    )
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY ds.assigned_at DESC"
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return {"assignments": [_row_to_dict(r) for r in rows]}


@router.post("/department-staff", status_code=201)
def assign_staff(
    body: StaffAssignIn,
    user=Depends(require_admin),
) -> dict:
    actor = user["id"]
    now = int(datetime.now(UTC).timestamp())
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM users WHERE id = ?", [body.user_id]).fetchone():
            raise HTTPException(404, "User not found")
        if not conn.execute("SELECT 1 FROM departments WHERE id = ?", [body.department_id]).fetchone():
            raise HTTPException(404, "Department not found")
        existing = conn.execute(
            "SELECT id FROM department_staff WHERE user_id = ? AND department_id = ?",
            [body.user_id, body.department_id],
        ).fetchone()
        if existing:
            raise HTTPException(409, "Already assigned")
        cur = conn.execute(
            "INSERT INTO department_staff (department_id, user_id, assigned_at) "
            "VALUES (?, ?, ?)",
            [body.department_id, body.user_id, now],
        )
        new_id = cur.lastrowid
        write_audit(conn=conn, actor_user_id=actor, action="admin.staff_assign",
                    target_type="department_staff", target_id=new_id)
        row = conn.execute(
            "SELECT * FROM department_staff WHERE id = ?", [new_id]
        ).fetchone()
    return _row_to_dict(row)


@router.delete("/department-staff/{assignment_id}", status_code=204)
def unassign_staff(
    assignment_id: int,
    user=Depends(require_admin),
) -> None:
    actor = user["id"]
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM department_staff WHERE id = ?", [assignment_id]
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Assignment not found")
        conn.execute("DELETE FROM department_staff WHERE id = ?", [assignment_id])
        write_audit(conn=conn, actor_user_id=actor, action="admin.staff_unassign",
                    target_type="department_staff", target_id=assignment_id)