import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { mockConfig, resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/billing",
}));

import BillingPage from "@/app/(app)/billing/page";
import NewInvoicePage from "@/app/(app)/billing/invoices/new/page";
import InvoiceDetailPage from "@/app/(app)/billing/invoices/[id]/page";

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  resetMockDb();
  resetMockConfig();
  queryCache.clear();
  push.mockClear();
});

afterAll(() => server.close());

describe("BillingPage (#7)", () => {
  it("lists invoices and claims across the two tabs", async () => {
    render(<BillingPage />);
    expect((await screen.findAllByText("INV-2026-0918")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rp/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: /claims/i }));
    expect(await screen.findByText("KLAIM/2026/0400")).toBeInTheDocument();
  });

  it("shows the empty state when there are no invoices", async () => {
    mockConfig.invoices.list.emptyResult = true;
    render(<BillingPage />);
    expect(await screen.findByText(/no invoices yet/i)).toBeInTheDocument();
  });

  it("renders an error state when the invoice list fails", async () => {
    mockConfig.invoices.list.errorRate = 1;
    render(<BillingPage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});

describe("InvoiceDetailPage (#7)", () => {
  it("renders line items, payments and claims", async () => {
    render(<InvoiceDetailPage params={{ id: "INV-2026-0918" }} />);
    expect(await screen.findByText("INV-2026-0918")).toBeInTheDocument();
    expect(screen.getByText(/cardiology consultation/i)).toBeInTheDocument();
    expect(screen.getByText(/record payment/i)).toBeInTheDocument();
  });

  it("records a payment through the dialog", async () => {
    const user = userEvent.setup();
    render(<InvoiceDetailPage params={{ id: "INV-2026-0918" }} />);
    await screen.findByText(/cardiology consultation/i);
    await user.click(screen.getByRole("button", { name: /record payment/i }));
    const amount = screen.getByLabelText("Amount");
    await user.type(amount, "500000");
    const submit = screen.getAllByRole("button", { name: /record payment$/i });
    await user.click(submit[submit.length - 1]);
    expect((await screen.findAllByText(/payment recorded/i)).length).toBeGreaterThan(0);
  });
});

describe("NewInvoicePage (#7)", () => {
  it("creates an invoice and navigates to its detail", async () => {
    const user = userEvent.setup();
    render(<NewInvoicePage />);
    await user.type(screen.getByLabelText(/search patient/i), "Siti");
    await user.click(await screen.findByRole("button", { name: /P-001108/i }));
    await user.type(screen.getByLabelText("Description"), "General consultation");
    await user.type(screen.getByLabelText("Unit"), "500000");
    await user.click(screen.getByRole("button", { name: /create invoice/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringContaining("/billing/invoices/")));
  });
});