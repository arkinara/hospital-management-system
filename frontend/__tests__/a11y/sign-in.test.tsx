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
  useSearchParams: () => new URLSearchParams(""),
}));

import SignInPage from "@/app/(auth)/sign-in/page";

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

describe("SignInPage a11y (#25/#54)", () => {
  it("has no serious or critical axe violations", async () => {
    const container = await renderPageAxe(
      <SignInPage />,
      () => screen.queryAllByText(/sign in/i).length > 0,
    );
    const result = await axeScan(container);
    assertNoViolations(result);
  });

  it("labels the credentials fields and announces auth errors", async () => {
    const { fireEvent } = await import("@testing-library/react");
    await renderPageAxe(<SignInPage />, () => screen.queryAllByText(/sign in/i).length > 0);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "bad@test.test" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/incorrect/i);
  });
});