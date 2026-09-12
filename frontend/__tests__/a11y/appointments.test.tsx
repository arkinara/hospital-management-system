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
  usePathname: () => "/appointments",
}));

import AppointmentsPage from "@/app/(app)/appointments/page";

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

describe("AppointmentsPage a11y (#54)", () => {
  it("has no serious or critical axe violations in the ready state", async () => {
    const container = await renderPageAxe(
      <AppointmentsPage />,
      () => screen.queryAllByText(/appointments on record/i).length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("has no serious or critical axe violations in the empty state", async () => {
    mockConfig.appointments.list.emptyResult = true;
    const container = await renderPageAxe(
      <AppointmentsPage />,
      () => screen.queryAllByText(/no appointments yet/i).length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("has no serious or critical axe violations in the error state", async () => {
    mockConfig.appointments.list.errorRate = 1;
    const container = await renderPageAxe(
      <AppointmentsPage />,
      () => screen.getAllByRole("alert").length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("keeps sort controls keyboard-reachable as real buttons", async () => {
    await renderPageAxe(
      <AppointmentsPage />,
      () => screen.queryAllByText(/appointments on record/i).length > 0,
    );
    expect(screen.getByRole("button", { name: /sort by date/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});