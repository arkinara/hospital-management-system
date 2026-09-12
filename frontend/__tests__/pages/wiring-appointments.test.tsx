import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { mockConfig, resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/appointments/new",
}));

import AppointmentBookingPage from "@/app/(app)/appointments/new/page";
import { TODAY } from "@/lib/fixtures";

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

async function fillBookingForm() {
  render(<AppointmentBookingPage />);
  await screen.findByLabelText(/^search patient/i);
  fireEvent.change(screen.getByLabelText(/^search patient/i), { target: { value: "Budi" } });
  const option = await screen.findByRole("button", { name: /Budi Santoso/i });
  fireEvent.click(option);
  // The doctor dropdown is populated from the live admin/users endpoint.
  await waitFor(() =>
    expect(screen.getByLabelText(/^doctor/i).querySelectorAll("option").length).toBeGreaterThan(1),
  );
  fireEvent.change(screen.getByLabelText(/^doctor/i), { target: { value: "2" } });
  // Schedule loads for the selected doctor.
  await waitFor(() =>
    expect(screen.getByRole("group", { name: /open appointment slots/i })).toBeInTheDocument(),
  );
  const free = screen
    .getByRole("group", { name: /open appointment slots/i })
    .querySelector('button[aria-pressed="false"]:not([disabled])') as HTMLButtonElement | null;
  return free;
}

describe("Appointment booking wiring (#28/#52)", () => {
  it("surfaces a live 409 conflict without clearing the entered form data", async () => {
    server.use(
      http.post("*/appointments", () =>
        HttpResponse.json(
          {
            error: { code: "slot_taken", message: "Slot is taken — choose another time", trace_id: "t-409" },
          },
          { status: 409 },
        ),
      ),
    );
    const free = await fillBookingForm();
    if (!free) return;
    fireEvent.click(free);
    fireEvent.click(screen.getByTestId("book-appointment"));

    expect(await screen.findByTestId("booking-error")).toHaveTextContent(/slot is taken/i);
    // Form data survives for adjustment + resubmit.
    expect(screen.getByTestId("booking-error")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("renders an error state with retry when the schedule fetch fails", async () => {
    mockConfig.appointments.schedule.errorRate = 1;
    render(<AppointmentBookingPage />);
    await screen.findByLabelText(/^search patient/i);
    fireEvent.change(screen.getByLabelText(/^search patient/i), { target: { value: "Budi" } });
    await screen.findByRole("button", { name: /Budi Santoso/i });
    await waitFor(() =>
      expect(screen.getByLabelText(/^doctor/i).querySelectorAll("option").length).toBeGreaterThan(1),
    );
    fireEvent.change(screen.getByLabelText(/^doctor/i), { target: { value: "2" } });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("invalidates the schedule and today queue after a successful booking", async () => {
    queryCache.set(["appointments", "doctor", "2", TODAY], { slots: [] });
    queryCache.set(["appointments", "today"], { appointments: [] });
    const free = await fillBookingForm();
    if (!free) return;
    fireEvent.click(free);
    fireEvent.click(screen.getByTestId("book-appointment"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/appointments"));
    // The schedule and queue prefixes were invalidated (cache cleared).
    expect(queryCache.get(["appointments", "doctor", "2", TODAY])).toBeUndefined();
    expect(queryCache.get(["appointments", "today"])).toBeUndefined();
  });
});
