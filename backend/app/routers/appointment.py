"""Appointment domain placeholder router.

Booking, conflict detection, calendar, queue — ticket #20.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/appointment", tags=["appointment"])


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"domain": "appointment", "status": "placeholder"}
