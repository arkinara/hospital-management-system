"""Admin domain router (ticket #23).

User CRUD (admin only), department CRUD, department-staff mapping, role
assignment. Bed capacity already exists on departments; capacity endpoints
are added here for ticket #44 dependency.
"""
from __future__ import annotations

import sqlite3
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
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
# Department capacity & bed occupancy (ticket #44)
# ---------------------------------------------------------------------------


def _occupied_beds(conn, dept_id: int) -> int:
    """Admitted patients currently assigned to the department — derived, never
    a stored counter that can drift."""
    try:
        return conn.execute(
            "SELECT COUNT(*) FROM patients WHERE primary_department_id = ? "
            "AND admission_status = 'admitted'",
            [dept_id],
        ).fetchone()[0]
    except sqlite3.Error:
        return 0


def _assigned_staff_count(conn, dept_id: int) -> int:
    return conn.execute(
        "SELECT COUNT(*) FROM department_staff WHERE department_id = ?", [dept_id]
    ).fetchone()[0]


def _capacity_payload(conn, row) -> dict:
    occ = _occupied_beds(conn, row["id"])
    cap = int(row["bed_capacity"] or 0)
    pressure = (occ / cap) if cap > 0 else 0.0
    return {
        "department": _row_to_dict(row),
        "bed_capacity": cap,
        "occupied_beds": occ,
        "available_beds": max(0, cap - occ),
        "min_clinicians_per_shift": row["min_clinicians_per_shift"],
        "assigned_staff_count": _assigned_staff_count(conn, row["id"]),
        "pressure": round(pressure, 4),
    }


class CapacityPatchIn(BaseModel):
    bed_capacity: int | None = Field(default=None, ge=0)
    min_clinicians_per_shift: int | None = Field(default=None, ge=0)


@router.get("/departments/over-capacity")
def departments_over_capacity(
    threshold: float = Query(0.9, ge=0.0, le=1.0),
    _user=Depends(require_role("admin")),
) -> dict:
    """Departments whose occupancy/capacity exceeds the threshold (ward
    pressure warnings). Zero-capacity departments never trip it."""
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM departments ORDER BY name").fetchall()
        over: list[dict] = []
        for row in rows:
            cap = int(row["bed_capacity"] or 0)
            occ = _occupied_beds(conn, row["id"])
            pressure = (occ / cap) if cap > 0 else 0.0
            if cap > 0 and pressure > threshold:
                over.append(
                    {
                        "department": _row_to_dict(row),
                        "bed_capacity": cap,
                        "occupied_beds": occ,
                        "pressure": round(pressure, 4),
                    }
                )
    return {"threshold": threshold, "departments": over}


@router.get("/departments/{dept_id}/capacity")
def department_capacity(
    dept_id: int,
    _user=Depends(require_role("admin", "doctor", "nurse")),
) -> dict:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM departments WHERE id = ?", [dept_id]).fetchone()
        if not row:
            raise HTTPException(404, "Department not found")
        return _capacity_payload(conn, row)


@router.patch("/departments/{dept_id}/capacity")
def update_department_capacity(
    dept_id: int,
    body: CapacityPatchIn,
    user=Depends(require_admin),
) -> dict:
    actor = user["id"]
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM departments WHERE id = ?", [dept_id]).fetchone()
        if not row:
            raise HTTPException(404, "Department not found")
        if body.bed_capacity is not None:
            occ = _occupied_beds(conn, dept_id)
            if body.bed_capacity < occ:
                raise HTTPException(
                    409,
                    f"bed_capacity cannot be below current occupancy ({occ} beds occupied)",
                )
        sets, params = [], []
        if body.bed_capacity is not None:
            sets.append("bed_capacity = ?"); params.append(body.bed_capacity)
        if body.min_clinicians_per_shift is not None:
            sets.append("min_clinicians_per_shift = ?"); params.append(body.min_clinicians_per_shift)
        if sets:
            params.append(dept_id)
            conn.execute(f"UPDATE departments SET {', '.join(sets)} WHERE id = ?", params)
        write_audit(conn=conn, actor_user_id=actor, action="admin.department_capacity_update",
                    target_type="department", target_id=dept_id,
                    metadata={"bed_capacity": body.bed_capacity,
                              "min_clinicians_per_shift": body.min_clinicians_per_shift})
        row = conn.execute("SELECT * FROM departments WHERE id = ?", [dept_id]).fetchone()
        return _capacity_payload(conn, row)


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
        departments = []
        for row in rows:
            payload = _row_to_dict(row)
            occ = _occupied_beds(conn, row["id"])
            cap = int(row["bed_capacity"] or 0)
            payload["occupied_beds"] = occ
            payload["total_beds"] = cap
            payload["occupancy_pct"] = round((occ / cap) * 100, 1) if cap > 0 else 0.0
            departments.append(payload)
    return {"departments": departments}


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


# ---------------------------------------------------------------------------
# Nurse-patient shift assignment (ticket #45)
# ---------------------------------------------------------------------------


class PatientAssignmentIn(BaseModel):
    patient_id: int
    user_id: int
    role: str = "nurse"
    shift_start: datetime
    shift_end: datetime
    bed_label: str | None = None


def _serialize_assignment(row) -> dict:
    data = _row_to_dict(row)
    if data.get("user_id") is None and "nurse_id" in data and data.get("nurse_id") is not None:
        data["user_id"] = data["nurse_id"]
    data["patient_name"] = None
    return data


@router.post("/patient-assignments", status_code=201)
def create_patient_assignment(
    body: PatientAssignmentIn,
    user=Depends(require_admin),
) -> dict:
    from app.services.patient_assignment import find_overlap, insert_assignment

    actor = user["id"]
    start = int(body.shift_start.timestamp())
    end = int(body.shift_end.timestamp())
    if end <= start:
        raise HTTPException(422, "shift_end must be after shift_start")
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM patients WHERE id = ?", [body.patient_id]).fetchone():
            raise HTTPException(404, "Patient not found")
        target = conn.execute(
            "SELECT role FROM users WHERE id = ?", [body.user_id]
        ).fetchone()
        if not target:
            raise HTTPException(404, "User not found")
        if target["role"] != "nurse":
            raise HTTPException(422, "user_id must reference a nurse account")
        overlap = find_overlap(
            conn, patient_id=body.patient_id, user_id=body.user_id,
            shift_start=start, shift_end=end,
        )
        if overlap:
            raise HTTPException(
                409,
                detail={
                    "code": "assignment_overlap",
                    "message": f"Assignment overlaps active assignment {overlap} "
                    "for the same patient and user",
                    "assignment_id": overlap,
                },
            )
        new_id = insert_assignment(
            conn,
            patient_id=body.patient_id,
            user_id=body.user_id,
            role=body.role,
            shift_start=start,
            shift_end=end,
            bed_label=body.bed_label,
            created_by=actor,
        )
        write_audit(conn=conn, actor_user_id=actor, action="patient_assignment.create",
                    target_type="patient_assignment", target_id=new_id,
                    metadata={"patient_id": body.patient_id, "user_id": body.user_id,
                              "shift_start": start, "shift_end": end})
        row = conn.execute("SELECT * FROM patient_assignments WHERE id = ?", [new_id]).fetchone()
    return _serialize_assignment(row)


@router.get("/users/{user_id}/my-patients")
def my_assigned_patients(
    user_id: int,
    shift_date: str = Query(..., description="YYYY-MM-DD"),
    user=Depends(require_role("admin", "nurse")),
) -> dict:
    """The "my patients this shift" worklist (#45): patients assigned to the
    user on the given date, enriched with acuity, allergies, bed label and
    vitals-due status."""
    if user["role"] == "nurse" and user["id"] != user_id:
        raise HTTPException(403, "Forbidden")
    try:
        datetime.strptime(shift_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(422, "shift_date must be YYYY-MM-DD") from None
    from app.services.patient_assignment import assignments_for_user_on_date

    now = int(datetime.now(UTC).timestamp())
    with get_conn() as conn:
        assignments = assignments_for_user_on_date(conn, user_id, shift_date)
        patients: list[dict] = []
        for a in assignments:
            p = conn.execute("SELECT * FROM patients WHERE id = ?", [a["patient_id"]]).fetchone()
            if p is None:
                continue
            allergies = [
                {"allergen": r["allergen"], "severity": r["severity"], "reaction": r["reaction"]}
                for r in conn.execute(
                    "SELECT allergen, severity, reaction FROM patient_allergies "
                    "WHERE patient_id = ?", [a["patient_id"]],
                ).fetchall()
            ]
            latest = conn.execute(
                "SELECT MAX(recorded_at) AS at FROM vitals WHERE patient_id = ?",
                [a["patient_id"]],
            ).fetchone()["at"]
            vitals_due = latest is None or (now - int(latest)) > 6 * 3600
            patients.append({
                "assignment_id": a["id"],
                "patient_id": p["id"],
                "mrn": p["mrn"],
                "full_name": p["full_name"],
                "acuity": p["acuity"],
                "admission_status": p["admission_status"],
                "primary_department_id": p["primary_department_id"],
                "bed_label": a["bed_label"],
                "allergies": allergies,
                "vitals_due": vitals_due,
            })
        patients.sort(key=lambda x: x["full_name"])
    return {"shift_date": shift_date, "user_id": user_id, "patients": patients}


@router.delete("/patient-assignments/{assignment_id}", status_code=204)
def cancel_patient_assignment(
    assignment_id: int,
    user=Depends(require_admin),
) -> None:
    actor = user["id"]
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM patient_assignments WHERE id = ?", [assignment_id]
        ).fetchone()
        if not row:
            raise HTTPException(404, "Assignment not found")
        cols = _table_cols(conn, "patient_assignments")
        if "status" in cols:
            conn.execute(
                "UPDATE patient_assignments SET status = 'cancelled' WHERE id = ?",
                [assignment_id],
            )
        else:
            conn.execute("DELETE FROM patient_assignments WHERE id = ?", [assignment_id])
        write_audit(conn=conn, actor_user_id=actor, action="patient_assignment.cancel",
                    target_type="patient_assignment", target_id=assignment_id)