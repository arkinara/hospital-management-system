/**
 * Billing domain serializer (#57.2).
 *
 * Maps the backend's flat snake_case billing rows onto the render types the
 * screens were built against. Amounts are `total_amount` / `amount_paid` real
 * columns; invoice status and claim status are separate enums, and claims are
 * fetched from their own endpoint rather than nested under an invoice.
 */

import type {
  BackendClaim,
  BackendInvoice,
  BackendInvoiceLine,
  BackendPayment,
  Claim,
  Invoice,
  InvoiceLine,
  Payment,
} from "@/lib/fixtures";
import { toDateOnly, toIso } from "./coerce";

type Loose = Record<string, unknown>;

export function toFrontendInvoiceLine(
  row: BackendInvoiceLine | Loose,
): InvoiceLine {
  const r = row as Loose;
  return {
    code: String(r.code ?? ""),
    desc: String(r.description ?? r.desc ?? ""),
    qty: Number(r.quantity ?? r.qty ?? 0),
    unit: Number(r.unit_amount ?? r.unit ?? 0),
    dept: String(r.department_code ?? r.dept ?? ""),
  };
}

export function toFrontendInvoice(
  row: BackendInvoice | Loose,
  lines: Array<BackendInvoiceLine | Loose> = [],
  claim: Claim["status"] = "none",
): Invoice {
  const r = row as Loose;
  return {
    id: String(r.id ?? ""),
    patient: String(r.patient_id ?? r.patient ?? ""),
    date: toDateOnly(r.created_at) || String(r.created_at ?? ""),
    total: Number(r.total_amount ?? r.total ?? 0),
    paid: Number(r.amount_paid ?? r.paid ?? 0),
    status: (r.status as Invoice["status"]) ?? "unpaid",
    insurer: String(r.payer_name ?? r.insurer ?? "Self-pay"),
    claim,
    lines: lines.map(toFrontendInvoiceLine),
  };
}

export function toFrontendClaim(row: BackendClaim | Loose): Claim {
  const r = row as Loose;
  return {
    id: String(r.id ?? ""),
    invoiceId: String(r.invoice_id ?? r.invoiceId ?? ""),
    payerName: String(r.payer_name ?? r.payerName ?? ""),
    claimNumber: String(r.claim_number ?? r.claimNumber ?? ""),
    status: (r.status as Claim["status"]) ?? "none",
    denialReason: (r.denial_reason as string | null) ?? null,
    appealDeadline: toIso(r.appeal_deadline),
    submittedAt: toIso(r.submitted_at),
  };
}

export function toFrontendPayment(row: BackendPayment | Loose): Payment {
  const r = row as Loose;
  return {
    id: String(r.id ?? ""),
    invoiceId: String(r.invoice_id ?? r.invoiceId ?? ""),
    amount: Number(r.amount ?? 0),
    method: (r.method as Payment["method"]) ?? "cash",
    reference: (r.reference as string | null) ?? null,
    paidAt: toIso(r.paid_at) ?? String(r.paid_at ?? ""),
  };
}

export interface FrontendInvoiceDetail {
  invoice: Invoice;
  line_items: InvoiceLine[];
  payments: Payment[];
  claims: Claim[];
}

/** `GET /billing/invoices/{id}` -> the detail screen's render shape. */
export function toFrontendInvoiceDetail(payload: {
  invoice: BackendInvoice | Loose;
  line_items?: Array<BackendInvoiceLine | Loose>;
  payments?: Array<BackendPayment | Loose>;
  claims?: Array<BackendClaim | Loose>;
}): FrontendInvoiceDetail {
  const claims = (payload.claims ?? []).map(toFrontendClaim);
  return {
    invoice: toFrontendInvoice(payload.invoice, payload.line_items ?? [], claims[0]?.status ?? "none"),
    line_items: (payload.line_items ?? []).map(toFrontendInvoiceLine),
    payments: (payload.payments ?? []).map(toFrontendPayment),
    claims,
  };
}
