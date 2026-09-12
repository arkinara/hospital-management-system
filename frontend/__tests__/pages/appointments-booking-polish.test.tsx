import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";
import { api } from "@/lib/api/client";
import { TODAY } from "@/lib/fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/appointments/new",
  useSearchParams: () => new URLSearchParams(""),
}));

import AppointmentBookingPage from "@/app/(app)/appointments/new/page";

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

async function pickPatientAndSlot(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/search patient/i), "Budi");
  await user.click(await screen.findByRole("button", { name: /P-001042/i }));
  await screen.findByRole("option", { name: /sari wibowo/i });
  await user.selectOptions(screen.getByLabelText("Doctor"), "2");
  const slot = await screen.findByRole("button", { name: /13:30/i });
  await user.click(slot);
}

describe("AppointmentBookingPage polish (#15)", () => {
  it("books and checks in immediately", async () => {
    const user = userEvent.setup();
    render(<AppointmentBookingPage />);
    await pickPatientAndSlot(user);

    await user.click(screen.getByTestId("book-checkin"));

    expect((await screen.findAllByText(/booked and checked in/i)).length).toBeGreaterThan(0);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/appointments"));
  });

  it("books and sends a stub SMS", async () => {
    const user = userEvent.setup();
    render(<AppointmentBookingPage />);
    await pickPatientAndSlot(user);

    await user.click(screen.getByTestId("book-sms"));

    expect(await screen.findByText(/sms confirmation sent/i)).toBeInTheDocument();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/appointments"));
  });

  it("shows a red conflict warning when the chosen slot was taken between loads", async () => {
    const user = userEvent.setup();
    render(<AppointmentBookingPage />);
    await pickPatientAndSlot(user);

    // Occupy the same slot out-of-band, simulating a booking made elsewhere.
    await api.post("/appointments", {
      patient_id: "P-001108",
      doctor_id: 2,
      date: TODAY,
      time: "13:30",
      reason: "Booked elsewhere",
    });

    await user.click(screen.getByTestId("book-appointment"));

    expect(await screen.findByTestId("conflict-warning")).toHaveTextContent(/just taken/i);
    expect(push).not.toHaveBeenCalled();
  });

  it("lists today's queue with status chips, filterable by doctor", async () => {
    const user = userEvent.setup();
    render(<AppointmentBookingPage />);

    await user.click(screen.getByRole("tab", { name: /today's appointments/i }));

    expect(await screen.findByText("A-8801")).toBeInTheDocument();
    expect(screen.getAllByText(/checked in/i).length).toBeGreaterThan(0);

    // Narrow to Dr. Sari Wibowo (D01) — only her appointments remain.
    await user.selectOptions(screen.getByLabelText("Doctor"), "D01");
    await waitFor(() => expect(screen.queryByText("A-8803")).not.toBeInTheDocument());
  });
});