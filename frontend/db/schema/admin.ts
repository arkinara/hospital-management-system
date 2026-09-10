import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./auth";

/** Admin domain tables: departments + department staff (PRD: DB Schema). */

export const departments = sqliteTable(
  "departments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    code: text("code").notNull(),
    type: text("type", {
      enum: ["general", "pediatric", "cardiology", "emergency"],
    }).notNull(),
    bedCapacity: integer("bed_capacity").notNull().default(0),
    minCliniciansPerShift: integer("min_clinicians_per_shift").notNull().default(1),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("departments_code_unique").on(table.code)]
);

export const departmentStaff = sqliteTable("department_staff", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  departmentId: integer("department_id")
    .notNull()
    .references(() => departments.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  assignedAt: integer("assigned_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});