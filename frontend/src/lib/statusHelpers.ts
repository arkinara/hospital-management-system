import type { StatusKey } from "@/components/ui";
import type { ClaimStatus, InvoiceStatus } from "@/lib/fixtures";

/** Map a backend invoice status onto the StatusChip vocabulary. */
export function invoiceStatusMeta(status: InvoiceStatus): { status: StatusKey; label?: string } {
  switch (status) {
    case "void":
      return { status: "cancelled", label: "Void" };
    case "draft":
      return { status: "draft" };
    case "partially_paid":
      return { status: "partially_paid" };
    case "paid":
      return { status: "paid" };
    default:
      return { status: "unpaid" };
  }
}

/** Map a backend claim status onto the StatusChip vocabulary. */
export function claimStatusMeta(status: ClaimStatus): { status: StatusKey; label?: string } {
  switch (status) {
    case "in_review":
      return { status: "in_progress", label: "In review" };
    case "settled":
      return { status: "completed", label: "Settled" };
    case "approved":
      return { status: "approved" };
    case "denied":
      return { status: "denied" };
    case "draft":
      return { status: "draft" };
    case "submitted":
      return { status: "submitted" };
    default:
      return { status: "none" };
  }
}