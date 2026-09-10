"""Patient domain placeholder router.

Registration, duplicate detection, search, timeline — ticket #19.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/patient", tags=["patient"])


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"domain": "patient", "status": "placeholder"}
