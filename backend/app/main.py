"""Hospital MS — FastAPI application factory.

One router per domain (auth, patient, appointment, medical-records,
billing, admin, widget-config, audit), CORS for the Next.js dev server,
a shared JSON error envelope, and GET /health carrying build metadata.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.errors import install_error_handlers
from app.routers import DOMAIN_NAMES, ROUTERS

settings = get_settings()

app = FastAPI(
    title="Hospital MS API",
    version=settings.build_sha,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in ROUTERS:
    app.include_router(router)

install_error_handlers(app)


@app.get("/health", tags=["health"])
async def health() -> dict[str, str | list[str]]:
    return {
        "status": "ok",
        "version": settings.build_sha,
        "domains": DOMAIN_NAMES,
    }
