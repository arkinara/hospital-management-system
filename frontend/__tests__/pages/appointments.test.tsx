import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { mockConfig, resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/appointments",
}));

import AppointmentBookingPage from "@/app/(app)/appointments/new/page";
import AppointmentsPage from "@/app/(app)/appointments/page";

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

describe("AppointmentBookingPage (#5)", () => {
  it("books an appointment through the slot picker", async () => {
    const user = userEvent.setup();
    render(<AppointmentBookingPage />);

    // Pick a patient.
    await user.type(screen.getByLabelText(/search patient/i), "Budi");
    await user.click(await screen.findByRole("button", { name: /P-001042/i }));

    // Pick a doctor once the options load.
    await screen.findByRole("option", { name: /sari wibowo/i });
    await user.selectOptions(screen.getByLabelText("Doctor"), "2");

    // Pick a free slot and submit.
    const slot = await screen.findByRole("button", { name: /13:30/i });
    await user.click(slot);
    await user.type(screen.getByLabelText(/reason/i), "Hypertension review");
    await user.click(screen.getByRole("button", { name: /book appointment/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/appointments"));
  });

  it("surfaces an inline slot error when the schedule fails to load", async () => {
    mockConfig.appointments.schedule.errorRate = 1;
    const user = userEvent.setup();
    render(<AppointmentBookingPage />);

    await screen.findByRole("option", { name: /sari wibowo/i });
    await user.selectOptions(screen.getByLabelText("Doctor"), "2");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});

describe("AppointmentsPage (#5)", () => {
  it("lists appointments", async () => {
    render(<AppointmentsPage />);
    expect((await screen.findAllByText("A-8801")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/hypertension review|post-pci follow-up/i).length).toBeGreaterThan(0);
  });

  it("shows the empty state when there are no appointments", async () => {
    mockConfig.appointments.list.emptyResult = true;
    render(<AppointmentsPage />);
    expect(await screen.findByText(/no appointments yet/i)).toBeInTheDocument();
  });

  it("renders an error state when the endpoint fails", async () => {
    mockConfig.appointments.list.errorRate = 1;
    render(<AppointmentsPage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});