import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { departments, patients } from "./schema";

/**
 * Seed placeholder fixtures. Idempotent: every row uses a natural unique
 * key (department code, patient MRN) and inserts with onConflictDoNothing,
 * so re-seeding never duplicates rows. The real fixture set lands in
 * ticket #38.
 */
const dbPath =
  process.env.HOSPITAL_DB_PATH ??
  path.resolve(process.cwd(), "../backend/db/hospital.db");

async function main() {
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);

  let inserted = 0;

  const deptSeed = await db
    .insert(departments)
    .values([
      { name: "General", code: "GEN", type: "general", bedCapacity: 40, minCliniciansPerShift: 4 },
      { name: "Pediatrics", code: "PED", type: "pediatric", bedCapacity: 20, minCliniciansPerShift: 3 },
      { name: "Cardiology", code: "CAR", type: "cardiology", bedCapacity: 15, minCliniciansPerShift: 2 },
      { name: "Emergency", code: "ER", type: "emergency", bedCapacity: 25, minCliniciansPerShift: 5 },
    ])
    .onConflictDoNothing()
    .returning({ id: departments.id });
  inserted += deptSeed.length;

  const patientSeed = await db
    .insert(patients)
    .values([
      { mrn: "MRN-000001", fullName: "Seed Patient One", acuity: "standard", admissionStatus: "outpatient" },
    ])
    .onConflictDoNothing()
    .returning({ id: patients.id });
  inserted += patientSeed.length;

  sqlite.close();
  console.log(`db:seed: ${inserted} row(s) inserted into ${dbPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});