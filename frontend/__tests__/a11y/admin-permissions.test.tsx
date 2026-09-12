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
  usePathname: () => "/admin/permissions",
}));

import PermissionMatrixScreen from "@/app/(app)/admin/permissions/page";

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

describe("AdminPermissionsPage a11y (#54)", () => {
  it("has no serious or critical axe violations in the ready state", async () => {
    const container = await renderPageAxe(
      <PermissionMatrixScreen />,
      () => screen.queryAllByText(/permission matrix/i).length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("has no serious or critical axe violations in the error state", async () => {
    mockConfig.permissions.get.errorRate = 1;
    const container = await renderPageAxe(
      <PermissionMatrixScreen />,
      () => screen.getAllByRole("alert").length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("labels every matrix checkbox", async () => {
    await renderPageAxe(
      <PermissionMatrixScreen />,
      () => screen.queryAllByText(/permission matrix/i).length > 0,
    );
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes.slice(0, 8)) {
      expect(b.getAttribute("aria-label") ?? "").not.toBe("");
    }
  });
});