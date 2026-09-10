"""Audit domain placeholder router.

Write-mostly append-only log; only Admin reads it back — ticket #23/#24.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"domain": "audit", "status": "placeholder"}
