import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { departments } from "./admin";
import { users } from "./auth";

/**
 * Patient domain tables (ticket #19).
 *
 * - `patients` owns demographics + acuity + admission status.
 * - `patient_allergies` is the patient-level safety banner that follows the
 *   patient across departments.
 * - `patient_departments` tracks every department a patient has been seen in.
 * - `patient_dedup_flags` records an override when a suspected duplicate is
 *   deliberately bypassed.
 */

export const patients = sqliteTable(
  "patients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mrn: text("mrn").notNull(),
    fullName: text("full_name").notNull(),
    dob: integer("dob", { mode: "timestamp" }),
    sex: text("sex", { enum: ["m", "f", "o"] }),
    nationalId: text("national_id"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    bloodType: text("blood_type"),
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactPhone: text("emergency_contact_phone"),
    acuity: text("acuity", { enum: ["critical", "urgent", "standard", "routine"] })
      .notNull()
      .default("standard"),
    admissionStatus: text("admission_status", {
      enum: ["admitted", "outpatient", "discharged"],
    })
      .notNull()
      .default("outpatient"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    primaryDepartmentId: integer("primary_department_id").references(() => departments.id),
    payerName: text("payer_name"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
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
  allergen: text("allergen").notNull(),
  severity: text("severity", {
    enum: ["mild", "moderate", "severe", "life_threatening"],
  }).notNull(),
  reaction: text("reaction"),
  notedBy: integer("noted_by").references(() => users.id),
  notedAt: integer("noted_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const patientDepartments = sqliteTable(
  "patient_departments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    patientId: integer("patient_id")
      .notNull()
      .references(() => patients.id),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departments.id),
    sinceDate: integer("since_date", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("patient_departments_patient_department_unique").on(
      table.patientId,
      table.departmentId
    ),
  ]
);

export const patientDedupFlags = sqliteTable("patient_dedup_flags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patientId: integer("patient_id")
    .notNull()
    .references(() => patients.id),
  matchedPatientId: integer("matched_patient_id").references(() => patients.id),
  matchType: text("match_type", { enum: ["national_id", "fuzzy_name_dob"] }).notNull(),
  similarity: integer("similarity"),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  overrideReason: text("override_reason"),
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
