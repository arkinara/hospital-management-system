import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { mockConfig, resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache, queryKeys } from "@/lib/api/queryCache";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/billing/invoices/INV-2026-0918",
}));

import InvoiceDetailPage from "@/app/(app)/billing/invoices/[id]/page";
import BillingPage from "@/app/(app)/billing/page";

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  resetMockDb();
  resetMockConfig();
  queryCache.clear();
  push.mockClear();
  server.resetHandlers();
});

afterAll(() => server.close());

describe("Billing wiring (#30)", () => {
  it("surfaces a clear not-found state for a missing invoice", async () => {
    render(<InvoiceDetailPage params={{ id: "INV-NOPE" }} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/not found|INV-NOPE/i);
  });

  it("invalidates the invoice detail cache after recording a payment", async () => {
    const key = queryKeys.invoice("INV-2026-0918");
    queryCache.set(key, { invoice: null, line_items: [], payments: [], claims: [] });
    render(<InvoiceDetailPage params={{ id: "INV-2026-0918" }} />);
    await screen.findByRole("button", { name: /record payment/i });
    fireEvent.click(screen.getByRole("button", { name: /record payment/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^amount/i), { target: { value: "10000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /record payment/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(queryCache.get(key)).toBeUndefined();
  });

  it("rejects a payment exceeding the outstanding balance", async () => {
    render(<InvoiceDetailPage params={{ id: "INV-2026-0918" }} />);
    await screen.findByRole("button", { name: /record payment/i });
    fireEvent.click(screen.getByRole("button", { name: /record payment/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^amount/i), { target: { value: "999999999" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /record payment/i }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/exceeds the outstanding balance/i);
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("renders the empty state for a zero-result invoice filter", async () => {
    mockConfig.invoices.list.emptyResult = true;
    render(<BillingPage />);
    expect(await screen.findByText(/no invoices/i)).toBeInTheDocument();
  });

  it("renders a retry-capable error state when the invoice list fails", async () => {
    mockConfig.invoices.list.errorRate = 1;
    render(<BillingPage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows the live 422 payment error from the server", async () => {
    server.use(
      http.post("*/invoices/:id/payments", () =>
        HttpResponse.json(
          {
            error: {
              code: "validation_error",
              message: [{ loc: ["body", "amount"], msg: "Amount exceeds outstanding balance" }],
              trace_id: "t-422",
            },
          },
          { status: 422 },
        ),
      ),
    );
    render(<InvoiceDetailPage params={{ id: "INV-2026-0918" }} />);
    await screen.findByRole("button", { name: /record payment/i });
    fireEvent.click(screen.getByRole("button", { name: /record payment/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^amount/i), { target: { value: "5000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /record payment/i }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/amount exceeds outstanding balance/i);
  });
});