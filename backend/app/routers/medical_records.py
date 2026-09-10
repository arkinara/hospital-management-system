"""Medical records domain placeholder router.

Visit notes, prescriptions, attachments, vitals, care plans — ticket #21.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/medical-records", tags=["medical-records"])


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"domain": "medical-records", "status": "placeholder"}
