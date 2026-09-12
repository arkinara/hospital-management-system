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
  usePathname: () => "/admin/reports",
}));

import ReportsPage from "@/app/(app)/admin/reports/page";

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

describe("AdminReportsPage a11y (#54)", () => {
  it("has no serious or critical axe violations in the ready state", async () => {
    const container = await renderPageAxe(
      <ReportsPage />,
      () => screen.queryAllByText(/reports/i).length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("provides a heading and reachable report links", async () => {
    await renderPageAxe(<ReportsPage />, () => screen.queryAllByText(/reports/i).length > 0);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
  });
});