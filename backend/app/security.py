"""Password and token primitives.

- Passwords are hashed with bcrypt (rounds from settings, >=12).
- Access tokens are JWT (HS256) and short-lived.
- Refresh tokens are opaque random strings stored as SHA-256 in the DB.

These helpers are the single source of truth consumed by `dependencies.py`
and the auth router.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.config import get_settings


def hash_password(plain: str, rounds: int | None = None) -> str:
    """Return a bcrypt hash of `plain`, salted and costed from settings."""
    settings = get_settings()
    cost = rounds or settings.bcrypt_rounds
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=cost)).decode("ascii")


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if `plain` matches the stored bcrypt `hashed` value."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("ascii"))
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: int, role: str) -> str:
    """Sign a short-lived JWT access token carrying `sub` and `role`."""
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_ttl_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """Verify signature and expiry, returning the JWT payload.

    Raises `jwt.ExpiredSignatureError` or `jwt.PyJWTError` on failure; callers
    translate those into a 401.
    """
    settings = get_settings()
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def create_refresh_token() -> str:
    """Return a new opaque refresh token (not stored in plaintext)."""
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    """Return the SHA-256 digest used for storage/lookup of a refresh token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
