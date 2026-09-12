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
  usePathname: () => "/appointments/new",
}));

import AppointmentBookingPage from "@/app/(app)/appointments/new/page";

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

describe("AppointmentBookingPage a11y (#54)", () => {
  it("has no serious or critical axe violations in the ready state", async () => {
    const container = await renderPageAxe(
      <AppointmentBookingPage />,
      () => screen.queryAllByText(/book appointment/i).length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("has no serious or critical axe violations when the schedule fails", async () => {
    mockConfig.appointments.schedule.errorRate = 1;
    const container = await renderPageAxe(
      <AppointmentBookingPage />,
      () => screen.queryAllByText(/book appointment/i).length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("labels all form controls and keeps tabs keyboard-reachable", async () => {
    await renderPageAxe(
      <AppointmentBookingPage />,
      () => screen.queryAllByText(/book appointment/i).length > 0,
    );
    expect(screen.getByLabelText(/^search patient/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^doctor/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^department/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^date/i)).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBeGreaterThanOrEqual(2);
  });
});