"""Domain router package. Each module owns one domain from the PRD."""

from app.routers import (
    admin,
    appointment,
    audit,
    auth,
    billing,
    medical_records,
    patient,
    widget_config,
)

# Display names used by GET /health. Hyphenated to match the ticket's
# domain list ("medical-records", "widget-config").
DOMAIN_NAMES: list[str] = [
    "auth",
    "patient",
    "appointment",
    "medical-records",
    "billing",
    "admin",
    "widget-config",
    "audit",
]

# Registration order; every router is importable and mounted on the app.
ROUTERS = [
    auth.router,
    patient.router,
    appointment.router,
    medical_records.router,
    billing.router,
    admin.router,
    widget_config.router,
    audit.router,
]

__all__ = [
    "DOMAIN_NAMES",
    "ROUTERS",
    "admin",
    "appointment",
    "audit",
    "auth",
    "billing",
    "medical_records",
    "patient",
    "widget_config",
]
