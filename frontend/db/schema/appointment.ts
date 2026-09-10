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
  durationMinutes: integer("duration_minutes").notNull().default(30),
  reason: text("reason"),
  status: text("status", {
    enum: ["booked", "checked_in", "in_progress", "completed", "cancelled", "no_show"],
  })
    .notNull()
    .default("booked"),
  checkedInAt: integer("checked_in_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
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