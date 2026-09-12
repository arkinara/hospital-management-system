import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";

const state = vi.hoisted(() => ({
  push: vi.fn(),
  patientId: "P-001042",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push }),
  usePathname: () => "/medical-records/new",
  useSearchParams: () => ({ get: (k: string) => (k === "patient_id" ? state.patientId : null) }),
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
  state.push.mockClear();
  state.patientId = "P-001042";
});

afterAll(() => server.close());

describe("MedicalRecordEntryPage (#6)", () => {
  it("blocks the form when no patient is selected", () => {
    state.patientId = "";
    render(<MedicalRecordEntryPage />);
    expect(screen.getByText(/no patient selected/i)).toBeInTheDocument();
  });

  it("shows the severe-allergy banner and keeps the prescription form locked until override", async () => {
    render(<MedicalRecordEntryPage />);

    // P-001042 has a severe penicillin allergy.
    expect(await screen.findByTestId("allergy-banner")).toHaveTextContent(/penicillin/i);
    expect(screen.getByTestId("allergy-banner")).toHaveTextContent(/severe/i);

    // Expand the prescription form; Add must be disabled until confirmed.
    fireEvent.click(screen.getByRole("button", { name: /add prescription/i }));
    const addButton = screen.getByRole("button", { name: /add prescription/i }) as HTMLButtonElement;
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/medication/i), { target: { value: "Amoxicillin 500 mg" } });
    fireEvent.change(screen.getByLabelText(/dosage/i), { target: { value: "500 mg" } });
    fireEvent.change(screen.getByLabelText(/frequency/i), { target: { value: "3×/day" } });
    fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: "7" } });

    fireEvent.click(screen.getByRole("checkbox", { name: /override contraindication/i }));
    fireEvent.click(addButton);

    expect(screen.getByText(/amoxicillin 500 mg/i)).toBeInTheDocument();
  });

  it("blocks saving when diagnosis is empty with an inline toast error", async () => {
    render(<MedicalRecordEntryPage />);
    await screen.findByText(/new visit note/i);

    fireEvent.change(screen.getByLabelText(/chief complaint/i), {
      target: { value: "Chest tightness" },
    });
    fireEvent.click(screen.getByTestId("save-draft"));

    expect((await screen.findAllByText(/diagnosis is required/i)).length).toBeGreaterThan(0);
    expect(state.push).not.toHaveBeenCalled();
  });

  it("saves a draft and redirects to the patient detail", async () => {
    render(<MedicalRecordEntryPage />);
    await screen.findByText(/new visit note/i);

    fireEvent.change(screen.getByLabelText(/chief complaint/i), {
      target: { value: "Post-PCI follow-up" },
    });
    fireEvent.change(screen.getByLabelText(/diagnosis/i), {
      target: { value: "I25.10 — Atherosclerotic heart disease" },
    });
    fireEvent.click(screen.getByTestId("save-draft"));

    await waitFor(() => expect(state.push).toHaveBeenCalledWith("/patients/P-001042"));
  });

  it("signs and locks with the correct password, rejecting a wrong one", async () => {
    render(<MedicalRecordEntryPage />);
    await screen.findByText(/new visit note/i);

    fireEvent.change(screen.getByLabelText(/chief complaint/i), {
      target: { value: "Post-PCI follow-up" },
    });
    fireEvent.change(screen.getByLabelText(/diagnosis/i), {
      target: { value: "I25.10 — Atherosclerotic heart disease" },
    });
    fireEvent.click(screen.getByTestId("sign-lock"));

    // Wrong password first.
    fireEvent.change(screen.getByLabelText(/your password/i), { target: { value: "wrong-pass" } });
    fireEvent.click(screen.getByTestId("confirm-sign"));
    expect(await screen.findByTestId("sign-error")).toHaveTextContent(/password confirmation failed/i);

    // Correct password.
    fireEvent.change(screen.getByLabelText(/your password/i), { target: { value: "Hospital2025!" } });
    fireEvent.click(screen.getByTestId("confirm-sign"));

    expect((await screen.findAllByText(/visit signed and locked/i)).length).toBeGreaterThan(0);
    await waitFor(() => expect(state.push).toHaveBeenCalledWith("/patients/P-001042"));
  });
});