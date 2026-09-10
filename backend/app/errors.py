"""Shared JSON error envelope.

Every error response leaves the API as
`{"error": {"code": ..., "message": ..., "trace_id": ...}}` — a JSON 404 for an
unregistered path, a JSON 422 for validation errors, never an HTML traceback.
The frontend can render the envelope without sniffing body types.
"""

from uuid import uuid4

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


def _envelope(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message, "trace_id": str(uuid4())}}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(f"http_{exc.status_code}", message),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_envelope("validation_error", exc.errors()),
        )
