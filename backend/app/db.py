"""Shared SQLite connection helper.

Every router opens a short-lived connection against the settings-configured
database path. Connections are used as context managers and always closed.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager

from app.config import get_settings


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    """Yield a configured sqlite connection; commits and closes on exit."""
    settings = get_settings()
    conn = sqlite3.connect(settings.resolved_database_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
