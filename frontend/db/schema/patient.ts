import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { departments } from "./admin";
import { users } from "./auth";

/** Patient domain tables (PRD: DB Schema). */

export const patients = sqliteTable(
  "patients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mrn: text("mrn").notNull(),
    fullName: text("full_name").notNull(),
    dob: integer("dob", { mode: "timestamp" }),
    sex: text("sex"),
    nationalId: text("national_id"),
    phone: text("phone"),
    address: text("address"),
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactPhone: text("emergency_contact_phone"),
    acuity: text("acuity", { enum: ["critical", "urgent", "standard", "routine"] })
      .notNull()
      .default("routine"),
    status: text("status", { enum: ["admitted", "outpatient", "discharged"] })
      .notNull()
      .default("outpatient"),
    primaryDepartmentId: integer("primary_department_id").references(() => departments.id),
    payerName: text("payer_name"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("patients_mrn_unique").on(table.mrn),
    uniqueIndex("patients_national_id_unique").on(table.nationalId),
  ]
);

export const patientAllergies = sqliteTable("patient_allergies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patientId: integer("patient_id")
    .notNull()
    .references(() => patients.id),
  substance: text("substance").notNull(),
  severity: text("severity", { enum: ["mild", "moderate", "severe"] }).notNull(),
  notedBy: integer("noted_by").references(() => users.id),
  notedAt: integer("noted_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const patientDedupFlags = sqliteTable("patient_dedup_flags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patientId: integer("patient_id")
    .notNull()
    .references(() => patients.id),
  matchedPatientId: integer("matched_patient_id").references(() => patients.id),
  matchType: text("match_type", { enum: ["national_id", "fuzzy_name_dob"] }).notNull(),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  overriddenBy: integer("overridden_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const patientAssignments = sqliteTable("patient_assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patientId: integer("patient_id")
    .notNull()
    .references(() => patients.id),
  nurseId: integer("nurse_id")
    .notNull()
    .references(() => users.id),
  bedLabel: text("bed_label"),
  shiftDate: text("shift_date").notNull(),
  shiftWindow: text("shift_window"),
  assignedAt: integer("assigned_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});