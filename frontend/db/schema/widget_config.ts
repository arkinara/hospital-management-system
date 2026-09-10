import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./auth";

/** Widget config domain tables (PRD: DB Schema). */

export const widgetDefinitions = sqliteTable(
  "widget_definitions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    defaultRole: text("default_role"),
    globallyEnabled: integer("globally_enabled", { mode: "boolean" }).notNull().default(true),
    globallyLocked: integer("globally_locked", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [uniqueIndex("widget_definitions_key_unique").on(table.key)]
);

export const userWidgetLayout = sqliteTable("user_widget_layout", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  widgetId: integer("widget_id")
    .notNull()
    .references(() => widgetDefinitions.id),
  positionOrder: integer("position_order").notNull().default(0),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  size: text("size"),
});