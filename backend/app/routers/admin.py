"""Admin domain placeholder router.

Users, departments, permission matrix, bed capacity — ticket #23.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"domain": "admin", "status": "placeholder"}
