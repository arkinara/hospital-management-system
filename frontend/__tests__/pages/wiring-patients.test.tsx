import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { mockConfig, resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/patients/register",
}));

import RegisterPatientPage from "@/app/(app)/patients/register/page";

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

describe("Patient registration wiring (#26)", () => {
  it("runs the duplicate check before creating and offers an override", async () => {
    // Force the dedup check to match every submit.
    server.use(
      http.post("*/patients/dedup-check", () =>
        HttpResponse.json({
          suspects: [
            {
              mrn: "P-001042",
              full_name: "Budi Santoso",
              dob: "1978-03-12",
              national_id: null,
              match_type: "fuzzy_name_dob",
              similarity: 0.92,
            },
          ],
        }),
      ),
    );
    render(<RegisterPatientPage />);
    await screen.findByLabelText(/full name/i);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Budi Santoso" } });
    fireEvent.change(screen.getByLabelText(/^department/i), { target: { value: "GEN" } });
    fireEvent.click(screen.getByRole("button", { name: /register patient/i }));

    // The duplicate-check hit surfaces the real matched record.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("P-001042")).toBeInTheDocument();
    expect(within(dialog).getByText(/duplicate check found/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    // Choosing override creates the new record and navigates to it.
    fireEvent.click(within(dialog).getByRole("button", { name: /register anyway/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/patients\/P-/)));
  });

  it("does not create a patient when the duplicate check fails", async () => {
    mockConfig.patients.dedupCheck.errorRate = 1;
    render(<RegisterPatientPage />);
    await screen.findByLabelText(/full name/i);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "A New Patient" } });
    fireEvent.change(screen.getByLabelText(/^department/i), { target: { value: "GEN" } });
    fireEvent.click(screen.getByRole("button", { name: /register patient/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/forced mock error/i);
    expect(push).not.toHaveBeenCalled();
  });

  it("surfaces a live 422 validation error without discarding the form", async () => {
    server.use(
      http.post("*/patients", () =>
        HttpResponse.json(
          {
            error: {
              code: "validation_error",
              message: [{ loc: ["body", "name"], msg: "Name must be at least 2 characters" }],
              trace_id: "t-422",
            },
          },
          { status: 422 },
        ),
      ),
    );
    render(<RegisterPatientPage />);
    await screen.findByLabelText(/full name/i);
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Budi" } });
    fireEvent.change(screen.getByLabelText(/^department/i), { target: { value: "GEN" } });
    fireEvent.click(screen.getByRole("button", { name: /register patient/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Name must be at least 2 characters/i);
    // Entered data is preserved for retry.
    expect(screen.getByLabelText(/full name/i)).toHaveValue("Budi");
    expect(push).not.toHaveBeenCalled();
  });
});