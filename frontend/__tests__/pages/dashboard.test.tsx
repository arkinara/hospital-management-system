import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { mockConfig, resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";
import { CurrentUserProvider } from "@/lib/auth/currentUserContext";
import { permissions } from "../components/testUtils";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/dashboard",
}));

import DashboardScreen from "@/components/dashboard/DashboardScreen";

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

function renderDashboard(role: "Admin" | "Doctor" | "Nurse" | "Receptionist") {
  return render(
    <CurrentUserProvider
      value={{
        session: { name: `${role} Tester`, role, dept: "—" },
        permissions,
        switchRole: vi.fn(),
      }}
    >
      <DashboardScreen />
    </CurrentUserProvider>,
  );
}

describe("Dashboard (#11)", () => {
  it("renders the admin's default widget set", async () => {
    renderDashboard("Admin");
    expect(await screen.findByText("Department Occupancy")).toBeInTheDocument();
    expect(screen.getByText("Revenue This Month")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add widget/i })).toBeInTheDocument();
  });

  it("shows the empty state when no widgets are enabled", async () => {
    mockConfig.widgets.me.emptyResult = true;
    renderDashboard("Admin");
    expect(await screen.findByText(/no widgets enabled/i)).toBeInTheDocument();
  });

  it("renders an error state with retry when the widget service fails", async () => {
    mockConfig.widgets.me.errorRate = 1;
    renderDashboard("Admin");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});

describe("Doctor dashboard (#13)", () => {
  it("shows the doctor's schedule and pending records", async () => {
    renderDashboard("Doctor");
    expect(await screen.findByText("Today's Schedule")).toBeInTheDocument();
    expect(screen.getByText("Pending Records")).toBeInTheDocument();
  });
});

describe("Nurse dashboard (#14)", () => {
  it("shows assigned patients and the vitals queue", async () => {
    renderDashboard("Nurse");
    expect(await screen.findByText("Assigned Patients")).toBeInTheDocument();
    expect(screen.getByText("Vitals Queue")).toBeInTheDocument();
    expect((await screen.findAllByText(/Critical/)).length).toBeGreaterThan(0);
  });
});