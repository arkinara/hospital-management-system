import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { departments } from "./admin";
import { users } from "./auth";
import { patients } from "./patient";

/** Appointment domain tables (PRD: DB Schema). */

export const appointments = sqliteTable("appointments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patientId: integer("patient_id")
    .notNull()
    .references(() => patients.id),
  doctorId: integer("doctor_id")
    .notNull()
    .references(() => users.id),
  departmentId: integer("department_id").references(() => departments.id),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }).notNull(),
  scheduledEnd: integer("scheduled_end", { mode: "timestamp" }),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  reason: text("reason"),
  notes: text("notes"),
  status: text("status", {
    enum: ["booked", "checked_in", "in_progress", "completed", "cancelled", "no_show"],
  })
    .notNull()
    .default("booked"),
  checkedInAt: integer("checked_in_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

/** Append-only audit of every appointment status transition (#20/#43). */
export const appointmentLifecycleEvents = sqliteTable("appointment_lifecycle_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  appointmentId: integer("appointment_id")
    .notNull()
    .references(() => appointments.id),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  occurredAt: integer("occurred_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  byUserId: integer("by_user_id").references(() => users.id),
  reason: text("reason"),
});

export const doctorAvailability = sqliteTable("doctor_availability", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  doctorId: integer("doctor_id")
    .notNull()
    .references(() => users.id),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  departmentId: integer("department_id").references(() => departments.id),
});

export const doctorBlockedDays = sqliteTable("doctor_blocked_days", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  doctorId: integer("doctor_id")
    .notNull()
    .references(() => users.id),
  blockedDate: text("blocked_date").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  reason: text("reason"),
});
