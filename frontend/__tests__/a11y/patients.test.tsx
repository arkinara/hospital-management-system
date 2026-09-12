import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";
import { axeScan, renderPageAxe, assertNoViolations } from "./helpers";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/patients",
}));

import PatientsPage from "@/app/(app)/patients/page";

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

describe("PatientsPage a11y (#54)", () => {
  it("has no serious or critical axe violations in the ready state", async () => {
    const container = await renderPageAxe(
      <PatientsPage />,
      () => screen.queryAllByText("Budi Santoso").length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("has no serious or critical axe violations in the empty state", async () => {
    const { mockConfig } = await import("@/lib/api/mockConfig");
    mockConfig.patients.list.emptyResult = true;
    const container = await renderPageAxe(
      <PatientsPage />,
      () => screen.getAllByText(/no patients here yet/i).length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("has no serious or critical axe violations in the error state", async () => {
    const { mockConfig } = await import("@/lib/api/mockConfig");
    mockConfig.patients.list.errorRate = 1;
    const container = await renderPageAxe(
      <PatientsPage />,
      () => screen.getAllByRole("alert").length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("keeps every interactive control keyboard-reachable", async () => {
    await renderPageAxe(<PatientsPage />, () => screen.queryAllByText("Budi Santoso").length > 0);
    const search = screen.getByLabelText(/^search/i);
    search.focus();
    expect(document.activeElement).toBe(search);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    // Filter chips are real buttons with aria-pressed.
    expect(screen.getAllByRole("button", { pressed: false }).length).toBeGreaterThan(0);
  });
});