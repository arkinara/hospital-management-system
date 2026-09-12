"""Vitals plausibility rules (ticket #55).

Nurse-entered readings are rejected server-side when a value falls outside the
clinically plausible range. The ranges are intentionally generous — they catch
typos and unit confusion, not edge-of-envelope physiology.

A reading is plausible only when every provided field is within range. Missing
fields are skipped, so a partial reading (BP without temperature) still
validates.
"""

from __future__ import annotations

from dataclasses import dataclass

VITALS_RANGES: dict[str, tuple[float, float]] = {
    "systolic": (50.0, 250.0),
    "diastolic": (30.0, 150.0),
    "heart_rate": (30.0, 220.0),
    "spo2": (50.0, 100.0),
    "temperature_c": (30.0, 45.0),
    "respiratory_rate": (5.0, 60.0),
}


@dataclass(frozen=True)
class Reading:
    systolic: float | None = None
    diastolic: float | None = None
    heart_rate: float | None = None
    spo2: float | None = None
    temperature_c: float | None = None
    respiratory_rate: float | None = None


def field_errors(reading: Reading) -> list[str]:
    """Return a human message per implausible field; empty means plausible."""
    errors: list[str] = []
    for field, (low, high) in VITALS_RANGES.items():
        value = getattr(reading, field)
        if value is None:
            continue
        if not (low <= value <= high):
            errors.append(f"{field} {value} outside plausible range {low}-{high}")
    return errors


def is_plausible(reading: Reading) -> bool:
    return not field_errors(reading)


def validate(reading: Reading) -> None:
    """Raise ValueError on the first implausible field, mirroring the router."""
    errors = field_errors(reading)
    if errors:
        raise ValueError(errors[0])
