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
  usePathname: () => "/not-authorized",
}));

import NotAuthorizedPage from "@/app/(app)/not-authorized/page";

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

describe("NotAuthorizedPage a11y (#54)", () => {
  it("has no serious or critical axe violations", async () => {
    const container = await renderPageAxe(
      <NotAuthorizedPage />,
      () => screen.queryAllByText(/don't have access/i).length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("provides a page heading and a way back", async () => {
    await renderPageAxe(
      <NotAuthorizedPage />,
      () => screen.queryAllByText(/don't have access/i).length > 0,
    );
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to dashboard/i })).toBeInTheDocument();
  });
});