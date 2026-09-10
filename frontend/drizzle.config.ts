import path from "node:path";
import { defineConfig } from "drizzle-kit";

/**
 * Hospital MS — Drizzle config (SQLite).
 *
 * The schema lives in this workspace (frontend/db/schema, one file per
 * domain). Generated migrations are checked in under frontend/db/migrations
 * and applied to the shared SQLite file, defaulting to
 * backend/db/hospital.db. Override with HOSPITAL_DB_PATH.
 */
const dbPath =
  process.env.HOSPITAL_DB_PATH ??
  path.resolve(process.cwd(), "../backend/db/hospital.db");

export default defineConfig({
  dialect: "sqlite",
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dbCredentials: { url: dbPath },
  verbose: true,
  strict: true,
});