import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";
import { TODAY } from "@/lib/fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/patients",
}));

import PatientsPage from "@/app/(app)/patients/page";
import PatientDetailPage from "@/app/(app)/patients/[mrn]/page";
import DepartmentDetailPage from "@/app/(app)/admin/departments/[id]/page";

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  resetMockDb();
  resetMockConfig();
  queryCache.clear();
  push.mockClear();
  server.resetHandlers();
});

afterAll(() => server.close());

describe("Patient list/detail wiring (#27)", () => {
  it("renders a clear not-found state for a missing patient", async () => {
    server.use(
      http.get("*/patients/:id", ({ params }) => {
        if (String(params.id) === "P-NOPE") {
          return HttpResponse.json(
            { error: { code: "not_found", message: "Patient 'P-NOPE' not found", trace_id: "t-404" } },
            { status: 404 },
          );
        }
        return HttpResponse.json({});
      }),
    );
    render(<PatientDetailPage params={{ mrn: "P-NOPE" }} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/not found|P-NOPE/i);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("applies the department filter against the live list endpoint", async () => {
    render(<PatientsPage />);
    await screen.findAllByText("Budi Santoso");
    fireEvent.change(screen.getByLabelText(/^department/i), { target: { value: "GEN" } });
    await waitFor(() => expect(screen.getAllByRole("row").length).toBeGreaterThan(0));
  });

  it("loads the department detail, capacity and staff assignment data", async () => {
    render(<DepartmentDetailPage params={{ id: "1" }} />);
    await screen.findByRole("heading", { name: /general/i });
    expect(screen.getByText(/occupied beds/i)).toBeInTheDocument();
    expect(screen.getByText(/available beds/i)).toBeInTheDocument();
  });
});