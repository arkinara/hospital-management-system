import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache, queryKeys } from "@/lib/api/queryCache";

const push = vi.fn();
const searchParams = new URLSearchParams("patient_id=P-001042");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/medical-records/new",
  useSearchParams: () => searchParams,
}));

import MedicalRecordEntryPage from "@/app/(app)/medical-records/new/page";

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

async function fillVisitNote() {
  render(<MedicalRecordEntryPage />);
  await screen.findByLabelText(/chief complaint/i);
  fireEvent.change(screen.getByLabelText(/chief complaint/i), { target: { value: "Chest tightness" } });
  fireEvent.change(screen.getByLabelText(/diagnosis/i), { target: { value: "I25.10" } });
}

describe("Medical record entry wiring (#29/#51)", () => {
  it("saves a draft, invalidates the timeline and navigates to the patient", async () => {
    queryCache.set(queryKeys.patientTimeline("P-001042"), { events: [] });
    await fillVisitNote();
    fireEvent.click(screen.getByTestId("save-draft"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/patients/P-001042"));
    expect(queryCache.get(queryKeys.patientTimeline("P-001042"))).toBeUndefined();
  });

  it("surfaces a live 422 allergy rejection and keeps the form data", async () => {
    server.use(
      http.post("*/medical-records/visits/:id/prescriptions", () =>
        HttpResponse.json(
          {
            error: {
              code: "allergy_contraindication",
              message: "Patient allergy blocks this medication",
              trace_id: "t-422",
            },
            allergens: [{ allergen: "Penicillin", severity: "severe" }],
          },
          { status: 422 },
        ),
      ),
    );
    await fillVisitNote();
    fireEvent.click(screen.getByRole("button", { name: /add prescription/i }));
    // P-001042 has a severe penicillin allergy; confirm the override first.
    fireEvent.click(screen.getByLabelText(/override contraindication/i));
    fireEvent.change(screen.getByLabelText(/medication/i), { target: { value: "Amoxicillin 500 mg" } });
    fireEvent.change(screen.getByLabelText(/dosage/i), { target: { value: "500 mg" } });
    fireEvent.change(screen.getByLabelText(/frequency/i), { target: { value: "3x/day" } });
    fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: /add prescription/i }));
    fireEvent.click(screen.getByTestId("save-draft"));
    // The server rejection surfaces via the toast; nothing navigates.
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.getByLabelText(/chief complaint/i)).toHaveValue("Chest tightness");
    expect(push).not.toHaveBeenCalled();
  });

  it("reports a password-confirmation failure when signing", async () => {
    await fillVisitNote();
    fireEvent.click(screen.getByTestId("sign-lock"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText(/^your password/i), { target: { value: "wrong-pass" } });
    fireEvent.click(screen.getByTestId("confirm-sign"));
    expect(await screen.findByTestId("sign-error")).toHaveTextContent(/password confirmation failed/i);
  });
});