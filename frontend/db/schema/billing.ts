import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { departments } from "./admin";
import { visitNotes } from "./medical_records";
import { patients } from "./patient";

/** Billing domain tables (PRD: DB Schema). */

export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patientId: integer("patient_id")
    .notNull()
    .references(() => patients.id),
  visitNoteId: integer("visit_note_id").references(() => visitNotes.id),
  payerName: text("payer_name"),
  totalAmount: real("total_amount").notNull().default(0),
  amountPaid: real("amount_paid").notNull().default(0),
  status: text("status", {
    enum: ["draft", "unpaid", "partially_paid", "paid", "void"],
  })
    .notNull()
    .default("unpaid"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const invoiceLineItems = sqliteTable("invoice_line_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoices.id),
  code: text("code").notNull(),
  description: text("description"),
  quantity: integer("quantity").notNull().default(1),
  unitAmount: real("unit_amount").notNull().default(0),
  itemType: text("item_type", {
    enum: ["consultation", "procedure", "medication", "room"],
  }).notNull(),
  departmentId: integer("department_id").references(() => departments.id),
});

export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoices.id),
  amount: real("amount").notNull(),
  method: text("method").notNull(),
  reference: text("reference"),
  paidAt: integer("paid_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insuranceClaims = sqliteTable("insurance_claims", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoices.id),
  payerName: text("payer_name").notNull(),
  claimNumber: text("claim_number"),
  status: text("status", {
    enum: ["none", "draft", "submitted", "in_review", "approved", "denied", "settled"],
  })
    .notNull()
    .default("none"),
  denialReason: text("denial_reason"),
  appealDeadline: integer("appeal_deadline", { mode: "timestamp" }),
  submittedAt: integer("submitted_at", { mode: "timestamp" }),
});