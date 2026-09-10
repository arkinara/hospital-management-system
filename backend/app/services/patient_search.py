"""Patient directory search (ticket #19).

Full-text-ish lookup over name, MRN, national_id and phone with optional
department / acuity / admission_status filters and bounded pagination.
Used by `GET /patients` and by the receptionist quick-search screen.

The department filter joins `patient_departments` so a patient seen in a
department they are not *primarily* assigned to still matches.
"""

from __future__ import annotations

import sqlite3

MAX_PAGE_SIZE = 100
MIN_QUERY_LENGTH = 2


def clamp_page_size(page_size: int) -> int:
    """Never return more than `MAX_PAGE_SIZE` records per page."""
    return max(1, min(int(page_size), MAX_PAGE_SIZE))


def _where(
    query: str | None,
    department: str | None,
    acuity: str | None,
    admission_status: str | None,
) -> tuple[str, list]:
    clauses = ["p.is_active = 1"]
    params: list = []

    if query:
        like = f"%{query.strip().lower()}%"
        clauses.append(
            "(lower(p.full_name) LIKE ? OR lower(p.mrn) LIKE ? "
            "OR lower(p.national_id) LIKE ? OR lower(p.phone) LIKE ?)"
        )
        params.extend([like, like, like, like])

    if department:
        clauses.append(
            "EXISTS (SELECT 1 FROM patient_departments pd "
            "JOIN departments d ON d.id = pd.department_id "
            "WHERE pd.patient_id = p.id AND (d.code = ? OR d.name = ?))"
        )
        params.extend([department, department])

    if acuity:
        clauses.append("p.acuity = ?")
        params.append(acuity)

    if admission_status:
        clauses.append("p.admission_status = ?")
        params.append(admission_status)

    return " AND ".join(clauses), params


def search_patients(
    conn: sqlite3.Connection,
    query: str | None = None,
    department: str | None = None,
    acuity: str | None = None,
    admission_status: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[sqlite3.Row], int]:
    """Return `(rows, total)` for the given filters, ordered by name."""
    if query is not None and 0 < len(query.strip()) < MIN_QUERY_LENGTH:
        return [], 0

    where_sql, params = _where(query, department, acuity, admission_status)
    total = conn.execute(
        f"SELECT COUNT(*) FROM patients p WHERE {where_sql}", params
    ).fetchone()[0]

    page = max(1, int(page))
    size = clamp_page_size(page_size)
    offset = (page - 1) * size
    rows = conn.execute(
        f"SELECT p.* FROM patients p WHERE {where_sql} "
        "ORDER BY p.full_name COLLATE NOCASE, p.id LIMIT ? OFFSET ?",
        [*params, size, offset],
    ).fetchall()
    return rows, total
