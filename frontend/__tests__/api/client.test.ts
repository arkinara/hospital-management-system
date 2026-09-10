import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import { api, ApiError } from "@/lib/api/client";
import { resetMockDb } from "@/lib/api/handlers";
import { mockConfig, resetMockConfig } from "@/lib/api/mockConfig";
import { server } from "@/lib/api/server";
import type { Appointment, AuthUser, Patient, Vitals, Widget } from "@/lib/fixtures";

process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  resetMockDb();
  resetMockConfig();
});

afterAll(() => {
  server.close();
});

describe("api client with MSW: happy path", () => {
  it("GET /patients returns typed fixture data", async () => {
    const res = await api.get<{ patients: Patient[]; total: number }>("/patients");
    expect(res.total).toBe(100);
    expect(res.patients[0].mrn).toBe("P-001042");
    expectTypeOf(res.patients[0]).toEqualTypeOf<Patient>();
  });

  it("GET /patients honours query filters", async () => {
    const res = await api.get<{ patients: Patient[] }>("/patients", {
      query: { dept: "CAR", acuity: "critical" },
    });
    expect(res.patients.every((p) => p.dept === "CAR" && p.acuity === "critical")).toBe(true);
  });

  it("GET /appointments filters by doctor_id and date", async () => {
    const res = await api.get<{ appointments: Appointment[] }>("/appointments", {
      query: { doctor_id: "D01", date: "2026-09-09" },
    });
    expect(res.appointments.length).toBeGreaterThan(0);
    expect(res.appointments.every((a) => a.doctor === "D01")).toBe(true);
  });

  it("POST /appointments/:id/check-in updates status", async () => {
    const updated = await api.post<Appointment>("/appointments/A-8801/check-in");
    expect(updated.status).toBe("checked_in");
    expect(updated.checkedInAt).toBeTruthy();
  });

  it("GET /auth/users returns typed auth users", async () => {
    const res = await api.get<{ users: AuthUser[] }>("/auth/users");
    expect(res.users.length).toBeGreaterThan(0);
    expectTypeOf(res.users[0]).toEqualTypeOf<AuthUser>();
  });

  it("GET /widgets/me respects the admin lock", async () => {
    const res = await api.get<{ widgets: Widget[] }>("/widgets/me", {
      query: { role: "doctor" },
    });
    const schedule = res.widgets.find((w) => w.key === "todays-schedule");
    expect(schedule?.locked).toBe(true);
    expect(schedule?.enabled).toBe(true);
  });
});

describe("api client with MSW: scenario switches", () => {
  it("forcing the error scenario throws a typed ApiError", async () => {
    mockConfig.patients.list.errorRate = 1;
    const err = await api
      .get<{ patients: Patient[] }>("/patients")
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiError = err as ApiError;
    expect(apiError.code).toBe("mock_error");
    expect(apiError.status).toBe(500);
    expect(apiError.traceId.length).toBeGreaterThan(0);
  });

  it("empty-result scenario returns an empty list", async () => {
    mockConfig.patients.list.emptyResult = true;
    const res = await api.get<{ patients: Patient[]; total: number }>("/patients");
    expect(res.total).toBe(0);
    expect(res.patients).toHaveLength(0);
  });

  it("latency scenario delays the response", async () => {
    mockConfig.patients.list.latency = 150;
    const started = performance.now();
    await api.get<{ patients: Patient[] }>("/patients");
    expect(performance.now() - started).toBeGreaterThanOrEqual(120);
  });

  it("an endpoint with no scenario returns fixture data immediately", async () => {
    const res = await api.get<{ vitals: Vitals[] }>("/vitals", {
      query: { patient: "P-001042", limit: "5" },
    });
    expect(res.vitals.length).toBeLessThanOrEqual(5);
  });
});

describe("api client with MSW: errors", () => {
  it("404 from the mock returns a typed ApiError with envelope fields", async () => {
    const err = await api
      .get<{ patients: Patient[] }>("/patients/P-DOES-NOT-EXIST")
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiError = err as ApiError;
    expect(apiError.code).toBe("not_found");
    expect(apiError.status).toBe(404);
    expect(apiError.traceId).toBeTruthy();
  });

  it("an unhandled endpoint returns an explicit no_handler error, not a hang", async () => {
    const err = await api
      .get<{ error: unknown }>("/invoices/INV-0001/summary")
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiError = err as ApiError;
    expect(apiError.code).toBe("no_handler");
    expect(apiError.status).toBe(404);
    expect(apiError.message).toMatch(/No mock handler/);
  });
});

describe("api client with MSW: no leakage between tests", () => {
  it("POST /patients creates a row visible to the next read", async () => {
    const created = await api.post<Patient>("/patients", { name: "Leak Probe" });
    expect(created.mrn).toMatch(/^P-\d{6}$/);
    const res = await api.get<{ patients: Patient[]; total: number }>("/patients", {
      query: { q: "Leak Probe" },
    });
    expect(res.patients.length).toBe(1);
  });

  it("resetMockDb restores the pristine fixture set", async () => {
    const res = await api.get<{ patients: Patient[]; total: number }>("/patients");
    expect(res.total).toBe(100);
    expect(res.patients.some((p) => p.name === "Leak Probe")).toBe(false);
  });
});