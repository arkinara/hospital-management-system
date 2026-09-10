"""Widget config domain placeholder router.

Per-user dashboard layout + admin global lock list — ticket #24.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/widget-config", tags=["widget-config"])


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"domain": "widget-config", "status": "placeholder"}
