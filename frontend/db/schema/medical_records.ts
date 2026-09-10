import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { departments } from "./admin";
import { users } from "./auth";
import { appointments } from "./appointment";
import { patients } from "./patient";

/** Medical records domain tables (PRD: DB Schema). */

export const visitNotes = sqliteTable("visit_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  appointmentId: integer("appointment_id").references(() => appointments.id),
  patientId: integer("patient_id")
    .notNull()
    .references(() => patients.id),
  doctorId: integer("doctor_id")
    .notNull()
    .references(() => users.id),
  chiefComplaint: text("chief_complaint"),
  diagnosis: text("diagnosis"),
  clinicalNotes: text("clinical_notes"),
  departmentId: integer("department_id").references(() => departments.id),
  status: text("status", { enum: ["draft", "submitted", "signed"] }).notNull().default("draft"),
  signedAt: integer("signed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const prescriptions = sqliteTable("prescriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  visitNoteId: integer("visit_note_id")
    .notNull()
    .references(() => visitNotes.id),
  medication: text("medication").notNull(),
  dosage: text("dosage"),
  frequency: text("frequency"),
  durationDays: integer("duration_days"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const attachments = sqliteTable("attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  visitNoteId: integer("visit_note_id")
    .notNull()
    .references(() => visitNotes.id),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
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
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});