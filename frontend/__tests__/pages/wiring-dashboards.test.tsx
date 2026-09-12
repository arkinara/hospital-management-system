import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { mockConfig, resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";
import { CurrentUserProvider } from "@/lib/auth/currentUserContext";
import type { PermissionMatrixData } from "@/components/ui";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/dashboard",
}));

import DashboardScreen from "@/components/dashboard/DashboardScreen";
import DoctorDashboardPage from "@/app/(app)/doctor-dashboard/page";
import NurseDashboardPage from "@/app/(app)/nurse-dashboard/page";
import ReceptionistDashboardPage from "@/app/(app)/receptionist-dashboard/page";

const permissions: PermissionMatrixData = {
  Admin: { Patients: "vced", Appointments: "vced", Records: "vced", Billing: "vced", Admin: "vced", Reports: "vced" },
  Doctor: { Patients: "vced", Appointments: "vce", Records: "vced", Billing: "v", Admin: "", Reports: "v" },
  Nurse: { Patients: "vce", Appointments: "vc", Records: "vce", Billing: "v", Admin: "", Reports: "v" },
  Receptionist: { Patients: "vc", Appointments: "vced", Records: "v", Billing: "vced", Admin: "", Reports: "v" },
};

function withRole(role: "Doctor" | "Nurse" | "Receptionist") {
  return function RoleWrapper({ children }: { children: React.ReactNode }) {
    return (
      <CurrentUserProvider
        value={{ session: { name: "Test User", role, dept: "GEN" }, permissions, switchRole: () => undefined }}
      >
        {children}
      </CurrentUserProvider>
    );
  };
}

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

describe("Dashboard wiring (#34/#35)", () => {
  it("renders the doctor's live schedule and pending-records widgets", async () => {
    const Wrapped = withRole("Doctor");
    render(
      <Wrapped>
        <DoctorDashboardPage />
      </Wrapped>,
    );
    await screen.findByRole("heading", { name: /dashboard/i });
    expect(await screen.findByText(/today's schedule/i)).toBeInTheDocument();
    expect(screen.getAllByText(/open/i).length).toBeGreaterThan(0);
  });

  it("renders a retry-capable error when the layout fetch fails", async () => {
    mockConfig.widgets.me.errorRate = 1;
    const Wrapped = withRole("Doctor");
    render(
      <Wrapped>
        <DashboardScreen />
      </Wrapped>,
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows the vitals-queue widget error in isolation", async () => {
    mockConfig.records.reviewQueue.errorRate = 1;
    const Wrapped = withRole("Doctor");
    render(
      <Wrapped>
        <DashboardScreen />
      </Wrapped>,
    );
    expect(await screen.findByText(/could not load vitals queue/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("renders the receptionist queue widgets from live data", async () => {
    const Wrapped = withRole("Receptionist");
    render(
      <Wrapped>
        <ReceptionistDashboardPage />
      </Wrapped>,
    );
    await screen.findByRole("heading", { name: /dashboard/i });
    expect(await screen.findByText(/today's appointments/i)).toBeInTheDocument();
    expect(screen.getAllByText(/registration queue/i).length).toBeGreaterThan(0);
  });

  it("renders the nurse's assigned patients and vitals widgets", async () => {
    const Wrapped = withRole("Nurse");
    render(
      <Wrapped>
        <NurseDashboardPage />
      </Wrapped>,
    );
    await screen.findByRole("heading", { name: /dashboard/i });
    expect(await screen.findByText(/assigned patients/i)).toBeInTheDocument();
    expect(screen.getAllByText(/vitals/i).length).toBeGreaterThan(0);
  });
});