import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { departments } from "./admin";

/** Auth / RBAC tables. Better Auth manages users + sessions (PRD: DB Schema). */

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    role: text("role", { enum: ["admin", "doctor", "nurse", "receptionist"] })
      .notNull()
      .default("receptionist"),
    departmentId: integer("department_id").references(() => departments.id),
    specialisation: text("specialisation"),
    status: text("status", { enum: ["active", "invited", "inactive"] })
      .notNull()
      .default("active"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    mfaEnabled: integer("mfa_enabled", { mode: "boolean" }).notNull().default(false),
    lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)]
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    token: text("token").notNull(),
    refreshTokenHash: text("refresh_token_hash"),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    revokedAt: integer("revoked_at", { mode: "timestamp" }),
  },
  (table) => [uniqueIndex("sessions_token_unique").on(table.token)]
);

export const permissionMatrix = sqliteTable(
  "permission_matrix",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    role: text("role", { enum: ["admin", "doctor", "nurse", "receptionist"] }).notNull(),
    module: text("module").notNull(),
    canView: integer("can_view", { mode: "boolean" }).notNull().default(false),
    canCreate: integer("can_create", { mode: "boolean" }).notNull().default(false),
    canEdit: integer("can_edit", { mode: "boolean" }).notNull().default(false),
    canDelete: integer("can_delete", { mode: "boolean" }).notNull().default(false),
    allowed: integer("allowed", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [uniqueIndex("permission_matrix_role_module_unique").on(table.role, table.module)]
);

export const passwordResets = sqliteTable("password_resets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});