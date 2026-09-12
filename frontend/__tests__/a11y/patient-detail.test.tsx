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
  usePathname: () => "/patients/P-001042",
}));

import PatientDetailPage from "@/app/(app)/patients/[mrn]/page";

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

describe("PatientDetailPage a11y (#54)", () => {
  it("has no serious or critical axe violations in the ready state", async () => {
    const container = await renderPageAxe(
      <PatientDetailPage params={{ mrn: "P-001042" }} />,
      () => screen.queryAllByText("Budi Santoso").length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("has no serious or critical axe violations in the error state", async () => {
    mockConfig.patients.detail.errorRate = 1;
    const container = await renderPageAxe(
      <PatientDetailPage params={{ mrn: "P-001042" }} />,
      () => screen.getAllByRole("alert").length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("provides a page heading and keyboard-reachable tabs", async () => {
    await renderPageAxe(
      <PatientDetailPage params={{ mrn: "P-001042" }} />,
      () => screen.queryAllByText("Budi Santoso").length > 0,
    );
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBeGreaterThanOrEqual(5);
    tabs[1].focus();
    expect(document.activeElement).toBe(tabs[1]);
  });
});