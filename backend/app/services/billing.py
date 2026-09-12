"""Billing domain rules (ticket #55).

Extracted from the billing router so the payment-status transition and the
monotonic invoice-number sequence are testable pure functions:

- `compute_payment_status` drives `none -> unpaid -> partially_paid -> paid`,
  and keeps a voided invoice void regardless of incoming payments.
- `next_invoice_number` produces the `INV-YYYY-NNNN` sequence.

The router stays the source of truth for HTTP/DB concerns; these functions are
the rules it applies.
"""

from __future__ import annotations

from datetime import UTC, datetime

INVOICE_STATUSES = {"draft", "unpaid", "partially_paid", "paid", "void"}
PAYMENT_METHODS = {"cash", "card", "insurance", "other"}
CLAIM_STATUSES = {"none", "draft", "submitted", "in_review", "approved", "denied", "settled"}

_NUMBER_WIDTH = 4


def compute_payment_status(paid: float, total: float, current_status: str = "unpaid") -> str:
    """Derive the invoice status from money paid so far.

    A voided invoice never un-voids: the router refuses new payments on voided
    invoices, but this guard keeps the rule self-contained.
    """
    if current_status == "void":
        return "void"
    if paid <= 0:
        return "unpaid"
    if paid < total:
        return "partially_paid"
    return "paid"


def _year_prefix(year: int | None = None) -> str:
    y = year if year is not None else datetime.now(UTC).year
    return f"INV-{y}-"


def next_invoice_number(existing: list[str] | None, year: int | None = None) -> str:
    """Return the next monotonic `INV-YYYY-NNNN` for the given year.

    `existing` is the set of invoice numbers already issued that year (any
    order); the highest trailing sequence wins, so the sequence never
    regresses even when rows are deleted.
    """
    prefix = _year_prefix(year)
    highest = 0
    for number in existing or []:
        if number is not None and str(number).startswith(prefix):
            try:
                seq = int(str(number).rsplit("-", 1)[1])
            except (ValueError, IndexError):
                continue
            highest = max(highest, seq)
    return f"{prefix}{highest + 1:0{_NUMBER_WIDTH}d}"
