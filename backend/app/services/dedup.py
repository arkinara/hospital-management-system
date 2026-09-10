"""Patient duplicate detection (ticket #19).

Server-enforced dedup. Two independent signals:

- exact `national_id` match -> hard block (409) with the existing record
- fuzzy `full_name` + exact `dob` -> similarity > `FUZZY_THRESHOLD` (0.85)

Name similarity is Levenshtein-based and normalised to [0, 1] so a single
edit in a 10-char name scores 0.9. The frontend may *suggest* duplicates,
but this module is the authority that blocks a silent duplicate insert.

An Admin can bypass a suspected match by sending the `X-Override-Dedup`
header; the caller then records a `patient_dedup_flags` row and an audit
entry (`patient.dedup_override`).
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

FUZZY_THRESHOLD = 0.85
MAX_CANDIDATES = 5


def normalize_name(value: str | None) -> str:
    """Lowercase and collapse whitespace so 'John  Doe' == 'john doe'."""
    if not value:
        return ""
    return " ".join(value.strip().lower().split())


def levenshtein(a: str, b: str) -> int:
    """Iterative Levenshtein distance with O(min(len)) memory."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    if len(a) < len(b):
        a, b = b, a
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        for j, cb in enumerate(b, start=1):
            insert = current[j - 1] + 1
            delete = previous[j] + 1
            substitute = previous[j - 1] + (ca != cb)
            current.append(min(insert, delete, substitute))
        previous = current
    return previous[-1]


def name_similarity(a: str | None, b: str | None) -> float:
    """Return 1 - (edit_distance / max_len) for two normalised names."""
    left, right = normalize_name(a), normalize_name(b)
    if not left or not right:
        return 0.0
    longest = max(len(left), len(right))
    return 1.0 - (levenshtein(left, right) / longest)


@dataclass(frozen=True)
class Suspect:
    patient_id: int
    mrn: str
    full_name: str
    dob: int | None
    national_id: str | None
    match_type: str
    similarity: float


def find_exact_national_id(conn: sqlite3.Connection, national_id: str | None) -> Suspect | None:
    """Return the active patient with this exact national_id, if any."""
    if not national_id:
        return None
    row = conn.execute(
        "SELECT id, mrn, full_name, dob, national_id FROM patients "
        "WHERE national_id = ? AND is_active = 1 LIMIT 1",
        (national_id,),
    ).fetchone()
    if row is None:
        return None
    return Suspect(
        row["id"],
        row["mrn"],
        row["full_name"],
        row["dob"],
        row["national_id"],
        "national_id",
        1.0,
    )


def find_fuzzy_name_dob(
    conn: sqlite3.Connection,
    full_name: str | None,
    dob: int | None,
    exclude_id: int | None = None,
) -> list[Suspect]:
    """Return up to `MAX_CANDIDATES` active patients with a close name + same DOB."""
    if not full_name or dob is None:
        return []
    rows = conn.execute(
        "SELECT id, mrn, full_name, dob, national_id FROM patients "
        "WHERE dob = ? AND is_active = 1",
        (dob,),
    ).fetchall()
    matches: list[Suspect] = []
    for row in rows:
        if exclude_id is not None and row["id"] == exclude_id:
            continue
        score = name_similarity(full_name, row["full_name"])
        if score > FUZZY_THRESHOLD:
            matches.append(
                Suspect(
                    row["id"],
                    row["mrn"],
                    row["full_name"],
                    row["dob"],
                    row["national_id"],
                    "fuzzy_name_dob",
                    round(score, 4),
                )
            )
    matches.sort(key=lambda s: s.similarity, reverse=True)
    return matches[:MAX_CANDIDATES]


def check_duplicates(
    conn: sqlite3.Connection,
    national_id: str | None,
    full_name: str | None,
    dob: int | None,
    exclude_id: int | None = None,
) -> list[Suspect]:
    """Return all suspected duplicates, exact national_id matches first."""
    exact = find_exact_national_id(conn, national_id)
    suspects: list[Suspect] = []
    if exact is not None and exact.patient_id != exclude_id:
        suspects.append(exact)
    seen = {s.patient_id for s in suspects}
    for suspect in find_fuzzy_name_dob(conn, full_name, dob, exclude_id):
        if suspect.patient_id not in seen:
            suspects.append(suspect)
    return suspects


def record_dedup_flag(
    conn: sqlite3.Connection,
    patient_id: int,
    matched_patient_id: int | None,
    match_type: str,
    similarity: float | None,
    overridden_by: int | None,
    reason: str | None,
) -> None:
    """Persist a `patient_dedup_flags` row after an explicit override."""
    conn.execute(
        "INSERT INTO patient_dedup_flags "
        "(patient_id, matched_patient_id, match_type, similarity, resolved, "
        "override_reason, overridden_by, created_at) "
        "VALUES (?, ?, ?, ?, 1, ?, ?, strftime('%s','now'))",
        (
            patient_id,
            matched_patient_id,
            match_type,
            int(round(similarity * 100)) if similarity is not None else None,
            reason,
            overridden_by,
        ),
    )
