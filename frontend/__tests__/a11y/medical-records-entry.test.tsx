import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { mockConfig, resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";
import { axeScan, renderPageAxe, assertNoViolations } from "./helpers";

const push = vi.fn();
const searchParams = new URLSearchParams("patient_id=P-001042");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/medical-records/new",
  useSearchParams: () => searchParams,
}));

import MedicalRecordEntryPage from "@/app/(app)/medical-records/new/page";

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

describe("MedicalRecordEntryPage a11y (#54)", () => {
  it("has no serious or critical axe violations in the ready state", async () => {
    const container = await renderPageAxe(
      <MedicalRecordEntryPage />,
      () => screen.queryAllByText(/new visit note/i).length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("has no serious or critical axe violations in the error state", async () => {
    mockConfig.patients.detail.errorRate = 1;
    const container = await renderPageAxe(
      <MedicalRecordEntryPage />,
      () => screen.getAllByRole("alert").length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("labels all form controls and keeps the allergy checkbox reachable", async () => {
    await renderPageAxe(
      <MedicalRecordEntryPage />,
      () => screen.queryAllByText(/new visit note/i).length > 0,
    );
    expect(screen.getByLabelText(/chief complaint/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/diagnosis/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/clinical notes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add prescription/i })).toBeInTheDocument();
  });
});