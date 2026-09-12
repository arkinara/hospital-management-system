import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/admin/widget-library",
  useSearchParams: () => new URLSearchParams(""),
}));

import WidgetLibraryPage from "@/app/(app)/admin/widget-library/page";

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

describe("WidgetLibraryPage (#10)", () => {
  it("renders the widget library table", async () => {
    render(<WidgetLibraryPage />);
    expect((await screen.findAllByText(/today's appointments/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/pending records/i).length).toBeGreaterThan(0);
  });

  it("toggles globally_enabled on an unlocked widget", async () => {
    render(<WidgetLibraryPage />);
    const toggle = await screen.findByTestId("toggle-enabled-recent-patients");
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
  });

  it("blocks locking a globally-disabled widget", async () => {
    render(<WidgetLibraryPage />);
    const lockToggle = await screen.findByTestId("toggle-lock-care-plan");
    expect(lockToggle).toBeDisabled();
  });

  it("asks for a confirmed disable-and-unlock when turning off a locked widget", async () => {
    render(<WidgetLibraryPage />);
    const toggle = await screen.findByTestId("toggle-enabled-todays-appointments");
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);
    // The locked widget cannot be silently disabled — a confirm names both consequences.
    expect(await screen.findByText(/also unlocks it/i)).toBeInTheDocument();
    expect(screen.getByText(/disable and unlock/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /disable and unlock/i }));
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
  });

  it("adds a widget through the modal", async () => {
    render(<WidgetLibraryPage />);
    await screen.findAllByText(/today's appointments/i);

    fireEvent.click(screen.getByTestId("add-widget"));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^key/i), { target: { value: "lab-results" } });
    fireEvent.change(within(dialog).getByLabelText(/display name/i), { target: { value: "Lab Results" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /add widget/i }));

    expect((await screen.findAllByText(/lab results/i)).length).toBeGreaterThan(0);
  });
});