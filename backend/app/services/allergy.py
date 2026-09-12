"""Allergy contraindication matching (ticket #55, extracted from #21).

Prescribing is blocked when a medication overlaps a patient's allergy. The
matching uses two levels:

- a medication-name -> allergy-class expansion (so "amoxicillin" expands to the
  penicillin class, catching a recorded "Penicillin" allergy), and
- the recorded allergy severity, where only `severe` / `life_threatening`
  hard-block prescribing. Mild/moderate allergies warn but do not block.

This module owns the class hints and the match function so the router's
`_check_allergy` reduces to a DB lookup + this pure rule.
"""

from __future__ import annotations

from dataclasses import dataclass

ALLERGY_CLASS_HINTS: dict[str, list[str]] = {
    "penicillin": ["penicillin"],
    "amoxicillin": ["penicillin"],
    "ampicillin": ["penicillin"],
    "aspirin": ["aspirin", "nsaid"],
    "ibuprofen": ["nsaid", "ibuprofen"],
    "sulfa": ["sulfa", "sulfonamide"],
    "latex": ["latex"],
}

ALLERGY_BLOCKING_SEVERITIES = {"severe", "life_threatening"}


@dataclass(frozen=True)
class RecordedAllergy:
    allergen: str
    severity: str
    reaction: str | None = None


def medication_classes(medication: str) -> list[str]:
    """Expand a medication name into the allergy classes it may trigger.

    Matches exact names and substrings, so "Amoxicillin 500 mg" still expands
    to the penicillin class.
    """
    med_lower = (medication or "").lower()
    classes: list[str] = []
    for med_class, allergens in ALLERGY_CLASS_HINTS.items():
        if med_lower == med_class or med_class in med_lower:
            classes.extend(allergens)
    return classes


def match_contraindication(
    medication: str,
    allergies: list[RecordedAllergy],
) -> dict | None:
    """Return the blocking allergy info, or None when prescribing is safe.

    Both the medication and each recorded allergen are expanded into their
    allergy classes (so "Amoxicillin" -> {penicillin}, "Aspirin" -> {aspirin,
    nsaid}); any class overlap with a blocking-severity allergy stops the
    prescription. The returned dict mirrors the router's 422 payload.
    """
    if not medication or not allergies:
        return None
    med_classes = set(medication_classes(medication))
    if not med_classes:
        return None
    blocking: list[RecordedAllergy] = []
    for allergy in allergies:
        allergen_classes = set(medication_classes(allergy.allergen))
        if not allergen_classes:
            continue
        if med_classes & allergen_classes and allergy.severity in ALLERGY_BLOCKING_SEVERITIES:
            blocking.append(allergy)
    if not blocking:
        return None
    return {
        "matched_medication_class": medication.lower(),
        "allergens": [
            {"allergen": a.allergen, "severity": a.severity, "reaction": a.reaction}
            for a in blocking
        ],
    }
