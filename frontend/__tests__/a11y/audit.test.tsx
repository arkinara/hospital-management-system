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
  usePathname: () => "/admin/audit",
}));

import AuditLogPage from "@/app/(app)/admin/audit/page";

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

describe("Audit log page a11y (#54)", () => {
  it("has no serious or critical axe violations in the ready state", async () => {
    const container = await renderPageAxe(
      <AuditLogPage />,
      () => screen.queryAllByRole("heading", { level: 1 }).length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("names the page with a level-1 heading", async () => {
    await renderPageAxe(
      <AuditLogPage />,
      () => screen.queryAllByRole("heading", { level: 1 }).length > 0,
    );
    expect(screen.getByRole("heading", { level: 1, name: /Audit log/i })).toBeInTheDocument();
  });
});
