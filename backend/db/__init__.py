"""Backend database package.

SQLite lives at the path from settings (default `backend/db/hospital.db`).
Drizzle owns the schema: the generated migration SQL in
`frontend/db/migrations/` is checked in, and this module applies it with
stdlib sqlite3 so the backend CI job needs no Node runtime. It mirrors the
`__drizzle_migrations` tracker table that drizzle-orm's migrator uses, so
`npm run db:migrate` (frontend) and `python -m db.migrate` (backend) are
interchangeable — running one after the other is a no-op.
"""

from db import migrate, seed

__all__ = ["migrate", "seed"]
