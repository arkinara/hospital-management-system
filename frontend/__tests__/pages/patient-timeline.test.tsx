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
  usePathname: () => "/patients/P-001042/timeline",
  useSearchParams: () => new URLSearchParams(""),
}));

import PatientTimelinePage from "@/app/(app)/patients/[mrn]/timeline/page";

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

describe("PatientTimelinePage (#16)", () => {
  it("renders the cross-department timeline with kind and department badges", async () => {
    render(<PatientTimelinePage params={{ mrn: "P-001042" }} />);

    expect(await screen.findByText(/rx: bisoprolol 5 mg/i)).toBeInTheDocument();
    expect(screen.getByText(/invoice INV-2026-0918/i)).toBeInTheDocument();
    expect(screen.getAllByText(/cardiology/i).length).toBeGreaterThan(0);
  });

  it("narrows by type filter", async () => {
    render(<PatientTimelinePage params={{ mrn: "P-001042" }} />);
    await screen.findByText(/rx: bisoprolol 5 mg/i);

    fireEvent.click(screen.getByRole("button", { name: /^billing/i }));
    expect(screen.getByText(/invoice INV-2026-0918/i)).toBeInTheDocument();
    expect(screen.queryByText(/rx: bisoprolol 5 mg/i)).not.toBeInTheDocument();
  });

  it("narrows by department filter and shows an empty state for a zero-match filter", async () => {
    render(<PatientTimelinePage params={{ mrn: "P-001042" }} />);
    await screen.findByText(/rx: bisoprolol 5 mg/i);

    // General only: prescriptions live under Cardiology for Budi, so they drop out.
    fireEvent.click(screen.getByRole("button", { name: /^general/i }));
    expect(screen.queryByText(/rx: bisoprolol 5 mg/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("General").length).toBeGreaterThan(0);

    // A date range in the future matches nothing.
    fireEvent.change(screen.getByLabelText(/^from/i), { target: { value: "2030-01-01" } });
    expect(await screen.findByText(/no events match these filters/i)).toBeInTheDocument();
  });

  it("opens the source record in a modal from the View source link", async () => {
    render(<PatientTimelinePage params={{ mrn: "P-001042" }} />);
    await screen.findByText(/rx: bisoprolol 5 mg/i);

    // Isolate visit events, then open the newest one.
    fireEvent.click(screen.getByRole("button", { name: /^visit note/i }));
    const viewSource = await screen.findAllByRole("button", { name: /view source/i });
    fireEvent.click(viewSource[0]);

    const dialog = screen.getByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getAllByText(/atherosclerotic heart disease/i).length).toBeGreaterThan(0),
    );
    expect(within(dialog).getByText(/diagnosis/i)).toBeInTheDocument();
  });

  it("toggles between newest-first and oldest-first order", async () => {
    render(<PatientTimelinePage params={{ mrn: "P-001042" }} />);
    await screen.findByText(/rx: bisoprolol 5 mg/i);

    const firstNewest = screen.getAllByRole("listitem")[0];
    const newestTitle = firstNewest.textContent ?? "";

    fireEvent.click(screen.getByRole("button", { name: /oldest first/i }));
    const firstOldest = screen.getAllByRole("listitem")[0];
    expect(firstOldest.textContent).not.toBe(newestTitle);
  });
});