import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./auth";

/**
 * Append-only audit log. No update or delete path — see
 * PRD "DB Schema / Admin tables" and the audit router.
 */
export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorUserId: integer("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  reason: text("reason"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});