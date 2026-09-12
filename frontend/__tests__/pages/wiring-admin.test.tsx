import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { mockConfig, resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache, queryKeys } from "@/lib/api/queryCache";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/admin/widget-library",
}));

import WidgetLibraryPage from "@/app/(app)/admin/widget-library/page";
import UsersPage from "@/app/(app)/admin/users/page";
import DepartmentsPage from "@/app/(app)/admin/departments/page";

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

describe("Admin wiring (#31/#32/#33)", () => {
  it("surfaces a live 409 duplicate-email conflict on user create", async () => {
    server.use(
      http.post("*/auth/users", () =>
        HttpResponse.json(
          { error: { code: "duplicate_email", message: "Email already in use", trace_id: "t-409" } },
          { status: 409 },
        ),
      ),
    );
    render(<UsersPage />);
    await screen.findAllByText("Rahmat Hidayat");
    fireEvent.click(screen.getByRole("button", { name: /new user/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^email/i), { target: { value: "dupe@test.test" } });
    fireEvent.change(within(dialog).getByLabelText(/^full name/i), { target: { value: "Dupe User" } });
    fireEvent.change(within(dialog).getByLabelText(/^password/i), { target: { value: "Password123!" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /create user/i }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/email already in use/i);
  });

  it("renders a retry-capable error when the user directory fails", async () => {
    mockConfig.admin.usersList.errorRate = 1;
    render(<UsersPage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("surfaces a live 409 duplicate department conflict on create", async () => {
    server.use(
      http.post("*/admin/departments", () =>
        HttpResponse.json(
          { error: { code: "duplicate_code", message: "Department code already exists", trace_id: "t-409" } },
          { status: 409 },
        ),
      ),
    );
    render(<DepartmentsPage />);
    await screen.findAllByText("Cardiology");
    fireEvent.click(screen.getByRole("button", { name: /new department/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^code/i), { target: { value: "GEN" } });
    fireEvent.change(within(dialog).getByLabelText(/^name/i), { target: { value: "General" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /create department/i }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/already exists/i);
  });

  it("invalidates the layout and library keys after a governance change", async () => {
    queryCache.set(queryKeys.myLayout(), { widgets: [], layout: [] });
    queryCache.set(queryKeys.widgetLibrary(), { widgets: [] });
    render(<WidgetLibraryPage />);
    await screen.findAllByText(/today's appointments/i);
    const toggle = screen.getByTestId("toggle-enabled-recent-patients");
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
    // Dashboard layout + admin library keys were invalidated.
    expect(queryCache.get(queryKeys.myLayout())).toBeUndefined();
    expect(queryCache.get(queryKeys.widgetLibrary())).toBeUndefined();
  });

  it("rolls back an optimistic lock when the server rejects it", async () => {
    server.use(
      http.patch("*/widget-config/widgets/:id/lock", () =>
        HttpResponse.json(
          { error: { code: "validation_error", message: "Cannot lock a disabled widget", trace_id: "t-422" } },
          { status: 422 },
        ),
      ),
    );
    render(<WidgetLibraryPage />);
    await screen.findAllByText(/today's appointments/i);
    const lockToggle = screen.getByTestId("toggle-lock-vitals-queue");
    // vitals-queue is unlocked and enabled; optimistic flip then rollback.
    expect(lockToggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(lockToggle);
    await waitFor(() => expect(lockToggle).toHaveAttribute("aria-checked", "false"));
  });
});