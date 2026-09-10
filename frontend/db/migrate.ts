import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/**
 * Applies checked-in Drizzle migrations to the shared SQLite file.
 * Re-running on an up-to-date database is a no-op (drizzle tracks the
 * applied set in `__drizzle_migrations`).
 */
const dbPath =
  process.env.HOSPITAL_DB_PATH ??
  path.resolve(process.cwd(), "../backend/db/hospital.db");

const sqlite = new Database(dbPath);
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: path.resolve(process.cwd(), "db/migrations") });

sqlite.close();
console.log(`db:migrate: applied pending migrations to ${dbPath}`);