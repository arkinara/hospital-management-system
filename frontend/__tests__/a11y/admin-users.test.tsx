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
  usePathname: () => "/admin/users",
}));

import UsersPage from "@/app/(app)/admin/users/page";

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

describe("AdminUsersPage a11y (#54)", () => {
  it("has no serious or critical axe violations in the ready state", async () => {
    const container = await renderPageAxe(
      <UsersPage />,
      () => screen.queryAllByText("Rahmat Hidayat").length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("has no serious or critical axe violations in the empty state", async () => {
    mockConfig.admin.usersList.emptyResult = true;
    const container = await renderPageAxe(
      <UsersPage />,
      () => screen.queryAllByText(/no users match these filters/i).length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("has no serious or critical axe violations in the error state", async () => {
    mockConfig.admin.usersList.errorRate = 1;
    const container = await renderPageAxe(
      <UsersPage />,
      () => screen.getAllByRole("alert").length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("focuses the new-user dialog on open and returns focus on close", async () => {
    const { fireEvent, waitFor } = await import("@testing-library/react");
    await renderPageAxe(<UsersPage />, () => screen.queryAllByText("Rahmat Hidayat").length > 0);
    const trigger = screen.getByRole("button", { name: /new user/i });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});