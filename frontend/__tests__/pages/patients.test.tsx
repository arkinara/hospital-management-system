import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { mockConfig, resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/patients",
}));

import PatientsPage from "@/app/(app)/patients/page";
import PatientDetailPage from "@/app/(app)/patients/[mrn]/page";

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

describe("PatientsPage (#3)", () => {
  it("renders the patient directory table", async () => {
    render(<PatientsPage />);
    expect((await screen.findAllByText("Budi Santoso")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("P-001042").length).toBeGreaterThan(0);
    expect(screen.getByText(/patients across the hospital/i)).toBeInTheDocument();
  });

  it("shows the empty state when no patients match", async () => {
    mockConfig.patients.list.emptyResult = true;
    render(<PatientsPage />);
    expect(await screen.findByText(/no patients here yet/i)).toBeInTheDocument();
    expect(screen.getByText(/register the first patient/i)).toBeInTheDocument();
  });

  it("renders an error state with retry when the endpoint fails", async () => {
    mockConfig.patients.list.errorRate = 1;
    render(<PatientsPage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});

describe("PatientDetailPage (#4)", () => {
  it("renders the patient header with demographics", async () => {
    render(<PatientDetailPage params={{ mrn: "P-001042" }} />);
    expect(await screen.findByText("Budi Santoso")).toBeInTheDocument();
    expect(screen.getByText("P-001042")).toBeInTheDocument();
    expect(screen.getByText("1978-03-12")).toBeInTheDocument();
  });

  it("switches to the timeline tab and lists clinical events", async () => {
    render(<PatientDetailPage params={{ mrn: "P-001042" }} />);
    await screen.findByText("Budi Santoso");
    fireEvent.click(screen.getByRole("tab", { name: /timeline/i }));
    expect(await screen.findByText("Clinical history")).toBeInTheDocument();
    expect((await screen.findAllByText(/visit note|vitals reading|prescription/i)).length).toBeGreaterThan(0);
  });

  it("renders an error state when the patient cannot be loaded", async () => {
    mockConfig.patients.detail.errorRate = 1;
    render(<PatientDetailPage params={{ mrn: "P-001042" }} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});