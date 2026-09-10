"""Auth domain placeholder router.

Real authentication (Better Auth + RBAC matrix) lands in ticket #18.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"domain": "auth", "status": "placeholder"}
