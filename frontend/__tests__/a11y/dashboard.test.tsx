import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { mockConfig, resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";
import { CurrentUserProvider } from "@/lib/auth/currentUserContext";
import { axeScan, renderPageAxe, assertNoViolations } from "./helpers";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/dashboard",
}));

import DashboardScreen from "@/components/dashboard/DashboardScreen";
import DoctorDashboardPage from "@/app/(app)/doctor-dashboard/page";
import NurseDashboardPage from "@/app/(app)/nurse-dashboard/page";
import ReceptionistDashboardPage from "@/app/(app)/receptionist-dashboard/page";
import type { PermissionMatrixData } from "@/components/ui";

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
        value={{
          session: { name: "Test User", role, dept: "GEN" },
          permissions,
          switchRole: () => undefined,
        }}
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

describe("DashboardScreen a11y (#54)", () => {
  it("has no serious or critical axe violations in the ready state", async () => {
    const Wrapped = withRole("Doctor");
    const container = await renderPageAxe(
      <Wrapped>
        <DashboardScreen />
      </Wrapped>,
      () =>
        screen.queryAllByText(/dashboard/i).length > 0 &&
        screen.queryAllByText(/pending records|no critical readings|no clinic session/i).length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("has no serious or critical axe violations in the error state", async () => {
    mockConfig.widgets.me.errorRate = 1;
    const Wrapped = withRole("Doctor");
    const container = await renderPageAxe(
      <Wrapped>
        <DashboardScreen />
      </Wrapped>,
      () => screen.getAllByRole("alert").length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("renders all three role dashboard pages", async () => {
    const WrappedNurse = withRole("Nurse");
    await renderPageAxe(
      <WrappedNurse>
        <NurseDashboardPage />
      </WrappedNurse>,
      () => screen.queryAllByText(/dashboard/i).length > 0,
    );
  });

  it("renders the receptionist dashboard with its queue widgets", async () => {
    const Wrapped = withRole("Receptionist");
    await renderPageAxe(
      <Wrapped>
        <ReceptionistDashboardPage />
      </Wrapped>,
      () => screen.queryAllByText(/dashboard/i).length > 0,
    );
  });

  it("renders the doctor dashboard page", async () => {
    const Wrapped = withRole("Doctor");
    await renderPageAxe(
      <Wrapped>
        <DoctorDashboardPage />
      </Wrapped>,
      () => screen.queryAllByText(/dashboard/i).length > 0,
    );
  });
});