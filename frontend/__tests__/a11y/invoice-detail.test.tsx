import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { mockConfig, resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";
import { axeScan, renderPageAxe, assertNoViolations } from "./helpers";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/billing/invoices/INV-2026-0918",
}));

import InvoiceDetailPage from "@/app/(app)/billing/invoices/[id]/page";

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  resetMockDb();
  resetMockConfig();
  queryCache.clear();
});

afterAll(() => server.close());

describe("InvoiceDetailPage a11y (#54)", () => {
  it("has no serious or critical axe violations in the ready state", async () => {
    const container = await renderPageAxe(
      <InvoiceDetailPage params={{ id: "INV-2026-0918" }} />,
      () => screen.queryAllByText(/record payment/i).length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("has no serious or critical axe violations in the error state", async () => {
    mockConfig.invoices.detail.errorRate = 1;
    const container = await renderPageAxe(
      <InvoiceDetailPage params={{ id: "INV-2026-0918" }} />,
      () => screen.getAllByRole("alert").length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("announces payment errors in an alert region inside the dialog", async () => {
    const { fireEvent } = await import("@testing-library/react");
    await renderPageAxe(
      <InvoiceDetailPage params={{ id: "INV-2026-0918" }} />,
      () => screen.queryAllByText(/record payment/i).length > 0,
    );
    fireEvent.click(screen.getByRole("button", { name: /record payment/i }));
    const dialog = await screen.findByRole("dialog");
    // A payment that exceeds the balance surfaces an alert inside the dialog.
    fireEvent.change(within(dialog).getByLabelText(/^amount/i), {
      target: { value: "999999999" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /record payment/i }));
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
  });
});