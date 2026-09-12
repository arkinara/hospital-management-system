import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { departments } from "./admin";
import { users } from "./auth";
import { appointments } from "./appointment";
import { patients } from "./patient";

/** Medical records domain tables (ticket #21). */

export const visitNotes = sqliteTable("visit_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patientId: integer("patient_id")
    .notNull()
    .references(() => patients.id),
  appointmentId: integer("appointment_id").references(() => appointments.id),
  doctorId: integer("doctor_id")
    .notNull()
    .references(() => users.id),
  departmentId: integer("department_id").references(() => departments.id),
  chiefComplaint: text("chief_complaint"),
  diagnosis: text("diagnosis"),
  clinicalNotes: text("clinical_notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
  signedAt: integer("signed_at", { mode: "timestamp" }),
  signedBy: integer("signed_by").references(() => users.id),
  isLockedAfterSign: integer("is_locked_after_sign", { mode: "boolean" })
    .notNull()
    .default(false),
});

export const prescriptions = sqliteTable("prescriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  visitNoteId: integer("visit_note_id")
    .notNull()
    .references(() => visitNotes.id),
  patientId: integer("patient_id")
    .notNull()
    .references(() => patients.id),
  doctorId: integer("doctor_id")
    .notNull()
    .references(() => users.id),
  medicationName: text("medication_name").notNull(),
  dosage: text("dosage"),
  frequency: text("frequency"),
  durationDays: integer("duration_days"),
  notes: text("notes"),
  refillsRemaining: integer("refills_remaining").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  signedAt: integer("signed_at", { mode: "timestamp" }),
  signedBy: integer("signed_by").references(() => users.id),
});

export const attachments = sqliteTable("attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  visitNoteId: integer("visit_note_id").references(() => visitNotes.id),
  patientId: integer("patient_id")
    .notNull()
    .references(() => patients.id),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storagePath: text("storage_path").notNull(),
  uploadedAt: integer("uploaded_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  isLabResult: integer("is_lab_result", { mode: "boolean" }).notNull().default(false),
  description: text("description"),
});

export const vitals = sqliteTable("vitals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patientId: integer("patient_id")
    .notNull()
    .references(() => patients.id),
  appointmentId: integer("appointment_id").references(() => appointments.id),
  systolic: integer("systolic"),
  diastolic: integer("diastolic"),
  heartRate: integer("heart_rate"),
  spo2: integer("spo2"),
  temperatureC: real("temperature_c"),
  respiratoryRate: integer("respiratory_rate"),
  note: text("note"),
  recordedBy: integer("recorded_by").references(() => users.id),
  recordedAt: integer("recorded_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  acknowledgedAt: integer("acknowledged_at", { mode: "timestamp" }),
  acknowledgedBy: integer("acknowledged_by").references(() => users.id),
});

export const carePlanItems = sqliteTable("care_plan_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patientId: integer("patient_id")
    .notNull()
    .references(() => patients.id),
  sourceVisitNoteId: integer("source_visit_note_id").references(() => visitNotes.id),
  description: text("description").notNull(),
  dueAt: integer("due_at", { mode: "timestamp" }),
  priority: text("priority", { enum: ["high", "normal", "low"] }).notNull().default("normal"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  completedBy: integer("completed_by").references(() => users.id),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdBy: integer("created_by").references(() => users.id),
  assignedTo: integer("assigned_to").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});