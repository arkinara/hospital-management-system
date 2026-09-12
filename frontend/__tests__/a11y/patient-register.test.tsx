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
  usePathname: () => "/patients/register",
}));

import RegisterPatientPage from "@/app/(app)/patients/register/page";

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

describe("RegisterPatientPage a11y (#54)", () => {
  it("has no serious or critical axe violations in the ready state", async () => {
    const container = await renderPageAxe(
      <RegisterPatientPage />,
      () => screen.queryAllByText(/register patient/i).length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("labels every form control", async () => {
    await renderPageAxe(
      <RegisterPatientPage />,
      () => screen.queryAllByText(/register patient/i).length > 0,
    );
    for (const name of [/full name/i, /date of birth/i, /^sex/i, /department/i, /phone/i, /insurer/i]) {
      expect(screen.getByLabelText(name)).toBeInTheDocument();
    }
  });

  it("keeps the submit action keyboard-reachable with a heading", async () => {
    await renderPageAxe(
      <RegisterPatientPage />,
      () => screen.queryAllByText(/register patient/i).length > 0,
    );
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: /register patient/i });
    submit.focus();
    expect(document.activeElement).toBe(submit);
  });
});