// Doctor availability screen (ticket #48).
// Covers: overlap rejection in the add-window form, the 409 conflict dialog
// for blocked periods, and day/week tab switching preserving doctor + date.
import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";
import { fixtures } from "@/lib/fixtures";
import { addDays, formatDateLong, isoDate } from "@/lib/schedule";
import DoctorAvailabilityScreen from "@/components/schedule/DoctorAvailabilityScreen";

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

const today = isoDate(new Date());

describe("DoctorAvailabilityScreen", () => {
  it("renders the doctor name and default working windows", async () => {
    render(<DoctorAvailabilityScreen doctorId={2} />);
    expect(await screen.findByTestId("doctor-availability")).toBeInTheDocument();
    expect(screen.getByTestId("doctor-name")).toHaveTextContent("Dr. Sari Wibowo");
    // Default mock windows: every day 08:00-17:00.
    expect(screen.getAllByTestId("window-row")).toHaveLength(7);
    expect(screen.getByTestId("effective-readback")).toHaveTextContent(/Dr. Sari Wibowo is bookable/i);
  });

  it("rejects an overlapping window before submitting", async () => {
    render(<DoctorAvailabilityScreen doctorId={2} />);
    await screen.findByTestId("doctor-availability");

    fireEvent.change(screen.getByLabelText("Day of week"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "08:00" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "12:00" } });
    fireEvent.click(screen.getByTestId("add-window"));

    expect(await screen.findByTestId("window-error")).toHaveTextContent(/overlaps/i);
    // Nothing was submitted — the window list is unchanged.
    expect(screen.getAllByTestId("window-row")).toHaveLength(7);
  });

  it("adds a non-overlapping window", async () => {
    render(<DoctorAvailabilityScreen doctorId={2} />);
    await screen.findByTestId("doctor-availability");

    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "18:00" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "20:00" } });
    fireEvent.click(screen.getByTestId("add-window"));

    await waitFor(() => expect(screen.getAllByTestId("window-row")).toHaveLength(8));
    expect(screen.getAllByTestId("window-row").some((r) => r.textContent?.includes("18:00–20:00"))).toBe(
      true,
    );
  });

  it("renders the 409 conflict dialog with the appointment list", async () => {
    render(<DoctorAvailabilityScreen doctorId={2} />);
    await screen.findByTestId("doctor-availability");

    // D01 has two live appointments on the fixture TODAY (08:00, 08:30).
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: fixtures.TODAY } });
    fireEvent.change(screen.getByLabelText("Start (optional)"), { target: { value: "08:00" } });
    fireEvent.change(screen.getByLabelText("End (optional)"), { target: { value: "09:00" } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "cath lab" } });
    fireEvent.click(screen.getByTestId("add-block"));

    expect(await screen.findByTestId("conflict-list")).toBeInTheDocument();
    expect(screen.getByText(/conflicts with 2 appointment/i)).toBeInTheDocument();
    expect(within(screen.getByTestId("conflict-list")).getAllByRole("listitem")).toHaveLength(2);
  });

  it("lets the user edit the block after a conflict", async () => {
    render(<DoctorAvailabilityScreen doctorId={2} />);
    await screen.findByTestId("doctor-availability");

    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: fixtures.TODAY } });
    fireEvent.change(screen.getByLabelText("Start (optional)"), { target: { value: "08:00" } });
    fireEvent.change(screen.getByLabelText("End (optional)"), { target: { value: "09:00" } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "cath lab" } });
    fireEvent.click(screen.getByTestId("add-block"));

    expect(await screen.findByTestId("conflict-list")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit block" }));
    await waitFor(() =>
      expect(screen.queryByTestId("conflict-list")).not.toBeInTheDocument(),
    );
    // Form values survive so the user can adjust and resubmit.
    expect((screen.getByLabelText("Start (optional)") as HTMLInputElement).value).toBe("08:00");
    expect((screen.getByLabelText(/reason/i) as HTMLTextAreaElement).value).toBe("cath lab");
  });

  it("switching day/week tabs preserves the selected doctor and date", async () => {
    render(<DoctorAvailabilityScreen doctorId={2} />);
    await screen.findByTestId("doctor-availability");

    const startDate = formatDateLong(today);
    expect(screen.getByText(startDate)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("next-week"));
    const nextDate = formatDateLong(addDays(today, 7));
    await waitFor(() => expect(screen.getByText(nextDate)).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("view-tab-week"));
    expect(screen.getAllByTestId("week-day")).toHaveLength(7);

    fireEvent.click(screen.getByTestId("view-tab-day"));
    expect(screen.getByText(nextDate)).toBeInTheDocument();
    expect(screen.getByTestId("doctor-name")).toHaveTextContent("Dr. Sari Wibowo");
  });

  it("renders the now-line only on today's date", async () => {
    render(<DoctorAvailabilityScreen doctorId={2} />);
    await screen.findByTestId("doctor-availability");

    // Today -> now-line present.
    expect(screen.getByTestId("now-line")).toBeInTheDocument();

    // Move to next week -> not today -> now-line gone.
    fireEvent.click(screen.getByTestId("next-week"));
    await waitFor(() =>
      expect(screen.queryByTestId("now-line")).not.toBeInTheDocument(),
    );
  });
});