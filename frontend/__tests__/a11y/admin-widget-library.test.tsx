import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { mockConfig, resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";
import { axeScan, renderPageAxe, assertNoViolations } from "./helpers";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/admin/widget-library",
}));

import WidgetLibraryPage from "@/app/(app)/admin/widget-library/page";

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

describe("AdminWidgetLibraryPage a11y (#54)", () => {
  it("has no serious or critical axe violations in the ready state", async () => {
    const container = await renderPageAxe(
      <WidgetLibraryPage />,
      () => screen.queryAllByText(/today's appointments/i).length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("has no serious or critical axe violations in the error state", async () => {
    mockConfig.widgets.definitions.errorRate = 1;
    const container = await renderPageAxe(
      <WidgetLibraryPage />,
      () => screen.getAllByRole("alert").length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("exposes the governance switches as labelled role=switch controls", async () => {
    await renderPageAxe(
      <WidgetLibraryPage />,
      () => screen.queryAllByText(/today's appointments/i).length > 0,
    );
    const switches = screen.getAllByRole("switch");
    expect(switches.length).toBeGreaterThanOrEqual(2);
    for (const s of switches.slice(0, 2)) {
      expect(s.getAttribute("aria-label") ?? "").not.toBe("");
    }
  });
});