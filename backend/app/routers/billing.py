"""Billing domain placeholder router.

Invoices, line items, payments, insurance claims — ticket #22.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"domain": "billing", "status": "placeholder"}
