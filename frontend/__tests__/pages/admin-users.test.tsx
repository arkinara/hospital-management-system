import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { mockConfig, resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";

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
  push.mockClear();
});

afterAll(() => server.close());

describe("UsersPage (#8)", () => {
  it("lists staff accounts with role and status", async () => {
    render(<UsersPage />);
    expect((await screen.findAllByText("Rahmat Hidayat")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Doctor/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Active/i).length).toBeGreaterThan(0);
  });

  it("opens the new-user modal", async () => {
    render(<UsersPage />);
    await screen.findAllByText("Rahmat Hidayat");
    fireEvent.click(screen.getByRole("button", { name: /new user/i }));
    expect(await screen.findByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^full name/i)).toBeInTheDocument();
  });

  it("shows the empty state when no users match", async () => {
    mockConfig.admin.usersList.emptyResult = true;
    render(<UsersPage />);
    expect(await screen.findByText(/no users match these filters/i)).toBeInTheDocument();
  });

  it("renders an error state when the user directory fails", async () => {
    mockConfig.admin.usersList.errorRate = 1;
    render(<UsersPage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});