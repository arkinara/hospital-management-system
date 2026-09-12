// End-to-end role journeys (ticket #55) — frontend.
//
// Renders a router-backed journey shell in jsdom and drives each PRD journey
// through the REAL typed API client against the MSW mock layer, so the
// FE↔API contract is proven end-to-end for all four roles:
//
//   Receptionist: sign in -> register patient -> book -> check in -> invoice -> payment
//   Doctor:       schedule -> start visit -> sign -> prescribe (allergy block) -> timeline
//   Nurse:        assigned patients -> record vitals -> complete care plan -> handover
//   Admin:        create user -> assign to department -> lock widget -> audit trail
//
// Each journey asserts its cross-department outcome (e.g. the Cardiology note
// shows up on the patient's timeline), not merely that a page rendered.
import React, { useEffect, useState } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { api } from "@/lib/api/client";
import { setSession } from "@/lib/auth/session";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";
import { fixtures } from "@/lib/fixtures";

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  resetMockDb();
  resetMockConfig();
  queryCache.clear();
  window.localStorage.clear();
});

afterAll(() => server.close());

interface JourneyStep {
  route: string;
  note: string;
}

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: { role: string };
}

async function signIn(email: string): Promise<void> {
  const login = await api.post<LoginResponse>("/auth/login", {
    email,
    password: "Hospital2025!",
  });
  setSession({ accessToken: login.access_token, refreshToken: login.refresh_token });
}

/**
 * A minimal router-backed page shell: the journey "navigates" by appending
 * steps whose `route` becomes the active route. Tests assert the final route,
 * the completed steps, and the absence of any FAILED step.
 */
function JourneyShell({ run }: { run: () => Promise<JourneyStep[]> }) {
  const [steps, setSteps] = useState<JourneyStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    run()
      .then((out) => {
        if (!cancelled) {
          setSteps(out);
          setDone(true);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [run]);

  const route = steps.length ? steps[steps.length - 1].route : "/sign-in";
  return (
    <div data-testid="journey-shell">
      <span data-testid="route">{route}</span>
      <ul>
        {steps.map((step, index) => (
          <li key={`${step.route}-${index}`} data-testid="journey-step">
            {step.note}
          </li>
        ))}
      </ul>
      {done ? <span data-testid="journey-done" /> : null}
      {error ? <span data-testid="journey-error">{error}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Receptionist journey
// ---------------------------------------------------------------------------

async function receptionistJourney(): Promise<JourneyStep[]> {
  const steps: JourneyStep[] = [];
  await signIn("receptionist@hospital.test");
  steps.push({ route: "/dashboard", note: "Signed in as receptionist" });

  const patient = await api.post<{ mrn: string }>("/patients", {
    full_name: "E2E Receptionist Patient",
    dob: "1990-01-01",
    phone: "081234567890",
    nid: "4455667788",
    sex: "f",
  });
  steps.push({ route: "/patients", note: `Registered ${patient.mrn}` });

  const appt = await api.post<{ id: string; status: string }>("/appointments", {
    patient: patient.mrn,
    doctor: "D01",
    dept: "CAR",
    date: fixtures.TODAY,
    time: "14:00",
    reason: "E2E booking",
  });
  steps.push({ route: "/appointments", note: `Booked ${appt.id} (${appt.status})` });

  const checked = await api.post<{ status: string }>(`/appointments/${appt.id}/check-in`);
  steps.push({ route: "/appointments", note: `Checked in — status ${checked.status}` });

  const invoice = await api.post<{ id: string }>("/invoices", {
    patient: patient.mrn,
    total: 150000,
  });
  steps.push({ route: "/billing", note: `Invoice ${invoice.id} created` });

  await api.post(`/invoices/${invoice.id}/payments`, { amount: 150000, method: "cash" });
  const list = await api.get<{ invoices: Array<{ id: string; status: string }> }>(
    "/invoices",
    { query: { patient: patient.mrn } },
  );
  const paid = list.invoices.find((i) => i.id === invoice.id);
  steps.push({
    route: "/billing",
    note: paid ? `Invoice ${invoice.id} settled (${paid.status})` : "FAILED: invoice not paid",
  });
  return steps;
}

// ---------------------------------------------------------------------------
// Doctor journey
// ---------------------------------------------------------------------------

async function doctorJourney(): Promise<JourneyStep[]> {
  const steps: JourneyStep[] = [];
  await signIn("doctor@hospital.test");
  steps.push({ route: "/dashboard", note: "Signed in as doctor" });

  const avail = await api.get<{ windows: unknown[]; week: unknown[] }>("/doctors/2/availability");
  steps.push({
    route: "/doctor/schedule",
    note: `Schedule: ${avail.week.length} day(s), ${avail.windows.length} window(s)`,
  });

  const visit = await api.post<{ id: string; diagnosis: string }>(
    "/medical-records/P-001042/visits",
    { diagnosis: "I25.10 — E2E Cardiology note", chiefComplaint: "Chest pain", dept: "CAR" },
  );
  steps.push({ route: "/records/visits", note: `Started visit ${visit.id}` });

  await api.post(`/medical-records/visits/${visit.id}/sign`, {
    password_confirmation: "Hospital2025!",
  });
  steps.push({ route: "/records/visits", note: `Signed visit ${visit.id}` });

  let blocked = false;
  try {
    await api.post(`/medical-records/visits/${visit.id}/prescriptions`, {
      medication: "Amoxicillin 500 mg",
    });
  } catch (err) {
    blocked = err instanceof Error && (err as { code?: string }).code === "allergy_contraindication";
  }
  steps.push({
    route: "/records/prescribe",
    note: blocked
      ? "Amoxicillin blocked — penicillin allergy contraindication"
      : "FAILED: allergy block did not trigger",
  });

  const rx = await api.post<{ medication: string }>(
    `/medical-records/visits/${visit.id}/prescriptions`,
    { medication: "Paracetamol", dosage: "500 mg", frequency: "2x/day" },
  );
  steps.push({ route: "/records/prescribe", note: `Prescribed ${rx.medication}` });

  const timeline = await api.get<{ timeline: Array<{ title: string; dept: string }> }>(
    "/patients/P-001042/timeline",
  );
  const cardiologyNote = timeline.timeline.find(
    (t) => t.title === "I25.10 — E2E Cardiology note",
  );
  steps.push({
    route: "/patients/P-001042/timeline",
    note: cardiologyNote
      ? `Cardiology note visible on cross-dept timeline (dept ${cardiologyNote.dept})`
      : "FAILED: Cardiology note missing from timeline",
  });
  return steps;
}

// ---------------------------------------------------------------------------
// Nurse journey
// ---------------------------------------------------------------------------

async function nurseJourney(): Promise<JourneyStep[]> {
  const steps: JourneyStep[] = [];
  await signIn("nurse@hospital.test");
  steps.push({ route: "/dashboard", note: "Signed in as nurse" });

  const patients = await api.get<{ total: number }>("/patients");
  steps.push({ route: "/nurse/patients", note: `${patients.total} assigned patient(s)` });

  const vitals = await api.post<{ id: string; systolic: number; diastolic: number }>("/vitals", {
    patient: "P-001042",
    systolic: 118,
    diastolic: 78,
    heartRate: 68,
    spo2: 98,
    temperatureC: 36.6,
    respiratoryRate: 16,
  });
  steps.push({
    route: "/nurse/vitals",
    note: `Vitals ${vitals.id} recorded (BP ${vitals.systolic}/${vitals.diastolic})`,
  });

  const item = await api.post<{ id: string; completed: boolean }>(
    "/patients/P-001042/care-plan/CP-001/complete",
  );
  steps.push({
    route: "/nurse/care-plan",
    note: `Care plan ${item.id} completed=${item.completed}`,
  });

  const timeline = await api.get<{
    timeline: Array<{ kind: string; body: string; title: string }>;
  }>("/patients/P-001042/timeline");
  const vitalsShown = timeline.timeline.some(
    (t) => t.kind === "vitals" && t.body.includes("118"),
  );
  const careDone = timeline.timeline.some(
    (t) => t.title.startsWith("Care plan") && t.body === "completed",
  );
  steps.push({
    route: "/patients/P-001042/handover",
    note:
      vitalsShown && careDone
        ? "Handover shows recorded vitals + completed care plan"
        : "FAILED: handover timeline missing vitals or care plan",
  });
  return steps;
}

// ---------------------------------------------------------------------------
// Admin journey
// ---------------------------------------------------------------------------

async function adminJourney(): Promise<JourneyStep[]> {
  const steps: JourneyStep[] = [];
  await signIn("admin@hospital.test");
  steps.push({ route: "/dashboard", note: "Signed in as admin" });

  const user = await api.post<{ id: string; email: string; role: string }>("/auth/users", {
    name: "E2E Admin Nurse",
    email: "e2e.admin@example.com",
    role: "nurse",
    dept: "CAR",
  });
  steps.push({ route: "/admin/users", note: `Created ${user.email} (${user.role})` });

  const assignment = await api.post<{ userId: string; departmentId: string }>(
    "/admin/department-staff",
    { userId: user.id, departmentId: "CAR" },
  );
  steps.push({
    route: "/admin/departments",
    note: `Assigned ${assignment.userId} to ${assignment.departmentId}`,
  });

  const locked = await api.put<{ key: string; globally_locked: boolean }>(
    "/widgets/admin/library/todays-appointments",
    { globally_locked: true },
  );
  steps.push({
    route: "/admin/widgets",
    note: `Locked widget ${locked.key} (${locked.globally_locked})`,
  });

  const audit = await api.get<{ entries: Array<{ action: string }> }>("/audit-log");
  const wanted = ["admin.user_create", "admin.staff_assign", "widget.lock_toggle"];
  const present = wanted.filter((action) => audit.entries.some((e) => e.action === action));
  steps.push({
    route: "/admin/audit",
    note:
      present.length === wanted.length
        ? `Audit trail records all ${wanted.length} admin actions`
        : `FAILED: audit missing ${wanted.filter((a) => !present.includes(a)).join(", ")}`,
  });
  return steps;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("E2E role journeys", () => {
  it("receptionist: register -> book -> check in -> invoice -> payment", async () => {
    render(<JourneyShell run={receptionistJourney} />);
    expect(await screen.findByTestId("journey-done")).toBeInTheDocument();
    const notes = screen.getAllByTestId("journey-step").map((n) => n.textContent);
    expect(notes.join(" ")).not.toMatch(/FAILED/);
    expect(notes).toContainEqual(expect.stringContaining("Registered"));
    expect(notes).toContainEqual(expect.stringContaining("Booked"));
    expect(notes).toContainEqual(expect.stringContaining("Checked in"));
    expect(notes).toContainEqual(expect.stringContaining("settled (paid)"));
    expect(screen.getByTestId("route")).toHaveTextContent("/billing");
  });

  it("doctor: schedule -> visit -> sign -> prescribe (allergy block) -> timeline", async () => {
    render(<JourneyShell run={doctorJourney} />);
    expect(await screen.findByTestId("journey-done")).toBeInTheDocument();
    const notes = screen.getAllByTestId("journey-step").map((n) => n.textContent);
    expect(notes.join(" ")).not.toMatch(/FAILED/);
    expect(notes).toContainEqual(expect.stringContaining("Signed visit"));
    expect(notes).toContainEqual(expect.stringContaining("Amoxicillin blocked"));
    expect(notes).toContainEqual(expect.stringContaining("Cardiology note visible"));
    expect(screen.getByTestId("route")).toHaveTextContent("/patients/P-001042/timeline");
  });

  it("nurse: patients -> vitals -> care plan complete -> handover", async () => {
    render(<JourneyShell run={nurseJourney} />);
    expect(await screen.findByTestId("journey-done")).toBeInTheDocument();
    const notes = screen.getAllByTestId("journey-step").map((n) => n.textContent);
    expect(notes.join(" ")).not.toMatch(/FAILED/);
    expect(notes).toContainEqual(expect.stringContaining("assigned patient(s)"));
    expect(notes).toContainEqual(expect.stringContaining("Vitals"));
    expect(notes).toContainEqual(expect.stringContaining("completed=true"));
    expect(notes).toContainEqual(expect.stringContaining("Handover shows"));
    expect(screen.getByTestId("route")).toHaveTextContent("/patients/P-001042/handover");
  });

  it("admin: create user -> assign dept -> lock widget -> audit trail", async () => {
    render(<JourneyShell run={adminJourney} />);
    expect(await screen.findByTestId("journey-done")).toBeInTheDocument();
    const notes = screen.getAllByTestId("journey-step").map((n) => n.textContent);
    expect(notes.join(" ")).not.toMatch(/FAILED/);
    expect(notes).toContainEqual(expect.stringContaining("Created"));
    expect(notes).toContainEqual(expect.stringContaining("Assigned"));
    expect(notes).toContainEqual(expect.stringContaining("Locked widget"));
    expect(notes).toContainEqual(expect.stringContaining("Audit trail records all 3"));
    expect(screen.getByTestId("route")).toHaveTextContent("/admin/audit");
  });
});