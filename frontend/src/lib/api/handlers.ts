/**
 * MSW request handlers (ticket #38).
 *
 * These are the mock endpoints every frontend ticket builds against. They are
 * wired into `setupWorker` for the browser (dev) and `setupServer` for node
 * (tests), and never into a production bundle — see `browser.prod.ts`.
 *
 * All mutation happens against an in-memory clone of the fixtures, so a test
 * that creates a patient cannot leak into the next test. Call `resetMockDb()`.
 */

import { delay, http, HttpResponse } from "msw";
import { fixtures } from "@/lib/fixtures";
import type {
  AdminUser,
  ApiDepartment,
  ApiErrorEnvelope,
  Appointment,
  AuditLogEntry,
  AuthSession,
  AuthUser,
  AvailabilityWindow,
  BlockedDay,
  BlockedDayConflict,
  CarePlanItem,
  Claim,
  ClinicalSummary,
  Department,
  DepartmentCapacity,
  DepartmentStaff,
  DepartmentStaffAssignment,
  DoctorAvailability,
  HistoryEvent,
  Invoice,
  MyPatient,
  Patient,
  PatientAllergy,
  Payment,
  PermissionMatrixEntry,
  Prescription,
  ReviewQueueEntry,
  Role,
  RoleDisplay,
  ScheduleSlot,
  TimelineEntry,
  User,
  VisitNote,
  Vitals,
  WeekDayData,
  Widget,
  WidgetLayout,
} from "@/lib/fixtures";
import {
  addDays,
  clockToMinutes,
  dayOfWeek,
  minutesToClock,
  rangesOverlap,
  validateBlock,
  validateWindow,
  type WindowCandidate,
} from "@/lib/schedule";
import { mockConfig, type Scenario } from "./mockConfig";

// ---------------------------------------------------------------------------
// In-memory database (clone of fixtures; reset between tests)
// ---------------------------------------------------------------------------

interface MockDb {
  patients: Patient[];
  appointments: Appointment[];
  visitNotes: VisitNote[];
  vitals: Vitals[];
  invoices: Invoice[];
  claims: Claim[];
  payments: Payment[];
  permissions: PermissionMatrixEntry[];
  widgets: Widget[];
  widgetLayouts: WidgetLayout[];
  users: User[];
  auditLog: AuditLogEntry[];
  carePlanItems: CarePlanItem[];
  departmentStaff: DepartmentStaff[];
  availability: Record<string, MockAvailabilityState>;
}

interface MockAvailabilityState {
  windows: AvailabilityWindow[];
  blockedDays: BlockedDay[];
  seq: number;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createDb(): MockDb {
  const base = clone({
    patients: fixtures.patients,
    appointments: fixtures.appointments,
    visitNotes: fixtures.visitNotes,
    vitals: fixtures.vitalReadings,
    invoices: fixtures.invoices,
    claims: fixtures.claims,
    payments: fixtures.payments,
    permissions: fixtures.permissionMatrix,
    widgets: fixtures.widgets,
    widgetLayouts: fixtures.widgetLayouts,
    users: fixtures.users,
    auditLog: fixtures.auditLog,
    carePlanItems: fixtures.carePlanItems,
    departmentStaff: fixtures.departmentStaff,
  });
  // Seed a few recent critical readings so the vitals review queue has data to
  // show. The pristine fixture set is untouched — these are mock-runtime only.
  const criticalSeeds = [
    { patient: "P-001042", systolic: 196, diastolic: 112, heartRate: 134, spo2: 88 },
    { patient: "P-001213", systolic: 184, diastolic: 104, heartRate: 141, spo2: 85 },
  ];
  const criticalReadings: Vitals[] = criticalSeeds.map((s, i) => ({
    id: `V-CRIT-${i + 1}`,
    patient: s.patient,
    recordedAt: `${todayIso()}T0${7 + i}:35:00.000Z`,
    systolic: s.systolic,
    diastolic: s.diastolic,
    heartRate: s.heartRate,
    spo2: s.spo2,
    temperatureC: 37.8,
    respiratoryRate: 24,
    recordedBy: "U-104",
    overdue: false,
  }));
  return {
    ...base,
    vitals: [...criticalReadings, ...base.vitals],
    availability: {},
  };
}

let db: MockDb = createDb();

/** Reset the mock database to the pristine fixture set. */
export function resetMockDb(): void {
  db = createDb();
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function envelope(code: string, message: string): ApiErrorEnvelope {
  return { error: { code, message, trace_id: `mock-${Math.random().toString(36).slice(2, 10)}` } };
}

function errorResponse(code: string, message: string, status: number): HttpResponse<ApiErrorEnvelope> {
  return HttpResponse.json<ApiErrorEnvelope>(envelope(code, message), { status });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function respond<T>(scenario: Scenario, payload: T, emptyPayload: T): Promise<any> {
  if (scenario.latency > 0) await delay(scenario.latency);
  if (scenario.errorRate > 0 && Math.random() < scenario.errorRate) {
    return HttpResponse.json(envelope("mock_error", "Forced mock error for this endpoint"), { status: 500 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return HttpResponse.json((scenario.emptyResult ? emptyPayload : payload) as any);
}

function notFound(resource: string, id: string): HttpResponse<ApiErrorEnvelope> {
  return errorResponse("not_found", `${resource} '${id}' not found`, 404);
}

const ROLE_TO_USER: Record<Role, string> = {
  admin: "U-101",
  doctor: "U-102",
  nurse: "U-104",
  receptionist: "U-105",
};

const ROLE_DISPLAY: Record<Role, RoleDisplay> = {
  admin: "Admin",
  doctor: "Doctor",
  nurse: "Nurse",
  receptionist: "Receptionist",
};

function departmentId(code: string): number | null {
  const index = fixtures.allDepartments.findIndex((d: Department) => d.id === code);
  return index === -1 ? null : index + 1;
}

function toAuthUser(user: User, index: number): AuthUser {
  return {
    id: index + 1,
    email: user.email,
    full_name: user.name,
    role: user.role.toLowerCase() as Role,
    department_id: user.dept === "—" ? null : departmentId(user.dept),
    is_active: user.status === "active",
    created_at: Math.floor(Date.parse("2026-01-01T00:00:00Z") / 1000) + index,
  };
}

/** Rich admin user row (`GET /admin/users`). */
function toAdminUser(user: User, index: number): AdminUser {
  const deptId = user.dept === "—" ? null : departmentId(user.dept);
  return {
    id: index + 1,
    email: user.email,
    full_name: user.name,
    role: user.role.toLowerCase() as Role,
    department_id: deptId,
    department_name:
      deptId == null ? null : (fixtures.allDepartments[deptId - 1]?.name ?? null),
    specialisation:
      user.role === "Doctor" ? (fixtures.doctors.find((d) => d.userId === user.id)?.spec ?? null) : null,
    is_active: user.status === "active",
    created_at: Math.floor(Date.parse("2026-01-01T00:00:00Z") / 1000) + index,
    last_login_at: user.lastLogin === "—" ? null : Math.floor(Date.parse(`${user.lastLogin.replace(" ", "T")}:00Z`) / 1000),
  };
}

function deptCodeForId(id: number | null): string {
  if (id == null) return "—";
  return fixtures.allDepartments[id - 1]?.id ?? "—";
}

function deptNameForId(id: number | null): string {
  if (id == null) return "—";
  return fixtures.allDepartments[id - 1]?.name ?? "Unknown";
}

function patientName(mrn: string): string {
  return db.patients.find((p) => p.mrn === mrn)?.name ?? mrn;
}

function readBody<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Doctor availability mock state (ticket #48)
// ---------------------------------------------------------------------------

const SLOT_MINUTES = 15;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Numeric backend doctor id -> fixture doctor code (e.g. 2 -> "D01"). */
function doctorCodeForId(id: string | number): string | undefined {
  const index = Number(id) - 1;
  const user = db.users[index];
  if (!user) return undefined;
  return fixtures.doctors.find((d) => d.userId === user.id)?.id;
}

function ensureAvailability(id: string): MockAvailabilityState {
  let state = db.availability[id];
  if (!state) {
    state = {
      windows: Array.from({ length: 7 }, (_, dow) => ({
        id: dow + 1,
        day_of_week: dow,
        start_time: "08:00",
        end_time: "17:00",
        department_id: null,
      })),
      blockedDays: [],
      seq: 100,
    };
    db.availability[id] = state;
  }
  return state;
}

function epochFor(date: string, clock: string): number {
  return Math.floor(Date.parse(`${date}T${clock}:00Z`) / 1000);
}

function buildMockDay(
  state: MockAvailabilityState,
  date: string,
  doctorCode: string | undefined,
): WeekDayData {
  const dow = dayOfWeek(date);
  const fullDayBlock = state.blockedDays.find(
    (b) => b.blocked_date === date && !b.start_time,
  );
  if (fullDayBlock) {
    return { date, day_of_week: dow, blocked: true, capacity: 0, booked: 0, slots: [] };
  }
  const windows = state.windows.filter((w) => w.day_of_week === dow);
  const partialBlocks = state.blockedDays.filter((b) => b.blocked_date === date && b.start_time);
  const appointments = doctorCode
    ? db.appointments.filter(
        (a) =>
          a.doctor === doctorCode &&
          a.date === date &&
          a.status !== "cancelled" &&
          a.status !== "no_show",
      )
    : [];

  const slots: ScheduleSlot[] = [];
  for (const window of windows) {
    let cursor = clockToMinutes(window.start_time);
    const end = clockToMinutes(window.end_time);
    while (cursor + SLOT_MINUTES <= end) {
      const slotEnd = cursor + SLOT_MINUTES;
      let status: ScheduleSlot["status"] = "free";
      let appointment_id: number | null = null;
      let reason: string | null = null;
      const block = partialBlocks.find(
        (b) =>
          rangesOverlap(
            cursor,
            slotEnd,
            clockToMinutes(b.start_time ?? ""),
            clockToMinutes(b.end_time ?? ""),
          ),
      );
      if (block) {
        status = "blocked";
        reason = block.reason;
      } else {
        const appt = appointments.find((a) => {
          const aStart = clockToMinutes(a.time);
          return rangesOverlap(cursor, slotEnd, aStart, aStart + 30);
        });
        if (appt) {
          status = "booked";
          appointment_id = Number(appt.id.replace(/\D/g, ""));
          reason = appt.reason;
        }
      }
      slots.push({
        start: `${date}T${minutesToClock(cursor)}:00Z`,
        end: `${date}T${minutesToClock(slotEnd)}:00Z`,
        start_epoch: epochFor(date, minutesToClock(cursor)),
        end_epoch: epochFor(date, minutesToClock(slotEnd)),
        status,
        appointment_id,
        patient_id: null,
        reason,
      });
      cursor = slotEnd;
    }
  }
  return {
    date,
    day_of_week: dow,
    blocked: false,
    capacity: slots.length,
    booked: slots.filter((s) => s.status === "booked").length,
    slots,
  };
}

function buildMockWeek(
  state: MockAvailabilityState,
  id: string,
  from: string,
  to: string,
): WeekDayData[] {
  const code = doctorCodeForId(id);
  const week: WeekDayData[] = [];
  let cursor = from;
  while (cursor <= to) {
    week.push(buildMockDay(state, cursor, code));
    cursor = addDays(cursor, 1);
  }
  return week;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  if (a.length < b.length) [a, b] = [b, a];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const insert = current[j] + 1;
      const del = previous[j + 1] + 1;
      const sub = previous[j] + (a[i] !== b[j] ? 1 : 0);
      current.push(Math.min(insert, del, sub));
    }
    previous = current;
  }
  return previous[previous.length - 1];
}

function roleFromRequest(request: Request, fallback: Role = "doctor"): Role {
  const role = new URL(request.url).searchParams.get("role");
  if (role && role in ROLE_TO_USER) return role as Role;
  return fallback;
}

/**
 * The dev login token is `mock_<role>_<nonce>`, so `/auth/me` can recover the
 * signed-in role without a server-side session store. Any other (or missing)
 * bearer token falls back to the `?role=` query param, then to the default.
 */
function roleFromToken(request: Request): Role | null {
  const auth = request.headers.get("Authorization") ?? "";
  const match = /Bearer mock_([a-z]+)_/i.exec(auth);
  if (match && match[1] in ROLE_TO_USER) return match[1] as Role;
  return null;
}

/** Shared dev credential accepted by the mock login handler. */
const DEMO_PASSWORD = "Hospital2025!";

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AuthUser;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const handlers = [
  // ---- Patients -----------------------------------------------------------
  http.get("*/patients/:id/timeline", async ({ params }) => {
    const id = String(params.id);
    const patient = db.patients.find((p) => p.mrn === id);
    if (!patient) return notFound("Patient", id);

    const visits: TimelineEntry[] = db.visitNotes
      .filter((v) => v.patient === id)
      .map((v) => ({
        at: v.createdAt,
        dept: v.dept,
        kind: "note" as const,
        by: v.doctor,
        title: v.diagnosis || "Visit note",
        body: v.chiefComplaint,
        flag: "normal" as const,
      }));

    const vitals: TimelineEntry[] = db.vitals
      .filter((v) => v.patient === id)
      .map((v) => ({
        at: v.recordedAt,
        dept: "GEN",
        kind: "vitals" as const,
        by: v.recordedBy,
        title: "Vitals recorded",
        body: `BP ${v.systolic}/${v.diastolic} · HR ${v.heartRate} · SpO2 ${v.spo2}%`,
        flag: "normal" as const,
      }));

    const carePlan: TimelineEntry[] = db.carePlanItems
      .filter((c) => c.patient === id)
      .map((c) => ({
        at: c.dueAt,
        dept: "GEN",
        kind: "note" as const,
        by: c.completedBy ?? "nurse",
        title: `Care plan — ${c.description}`,
        body: c.completed ? "completed" : "open",
        flag: "normal" as const,
      }));

    const base = patient.mrn === "P-001042" ? fixtures.timeline : [];
    const timeline = [...carePlan, ...vitals, ...visits, ...base];
    return respond(mockConfig.patients.timeline, { timeline }, { timeline: [] });
  }),

  http.get("*/patients/:id", async ({ params }) => {
    const id = String(params.id);
    const patient = db.patients.find((p) => p.mrn === id);
    if (!patient) return notFound("Patient", id);
    return respond(mockConfig.patients.detail, patient, null as unknown as Patient);
  }),

  http.get("*/patients/:id/clinical-summary", async ({ params }) => {
    const id = String(params.id);
    const patient = db.patients.find((p) => p.mrn === id);
    if (!patient) return notFound("Patient", id);
    const allergies = fixtures.patientAllergies.filter((a) => a.patient === id);
    const activeRx = db.visitNotes
      .filter((v) => v.patient === id)
      .reduce((n, v) => n + v.prescriptions.length, 0);
    const activeAppts = db.appointments.filter(
      (a) => a.patient === id && a.status !== "cancelled" && a.status !== "no_show" && a.status !== "completed",
    ).length;
    const summary: ClinicalSummary = {
      id: Number(id.replace(/\D/g, "")),
      mrn: patient.mrn,
      full_name: patient.name,
      dob: patient.dob,
      sex: patient.sex,
      phone: patient.phone,
      email: null,
      acuity: patient.acuity,
      admission_status: patient.status,
      is_active: true,
      primary_department_id: departmentId(patient.dept),
      allergies,
      active_prescriptions_count: activeRx,
      active_appointments_count: activeAppts,
    };
    return respond(mockConfig.patients.clinicalSummary, summary, null as unknown as ClinicalSummary);
  }),

  http.get("*/patients/:id/prescriptions", async ({ params }) => {
    const id = String(params.id);
    const patient = db.patients.find((p) => p.mrn === id);
    if (!patient) return notFound("Patient", id);
    const prescriptions = db.visitNotes
      .filter((v) => v.patient === id)
      .flatMap((v) => v.prescriptions.map((rx) => ({ ...rx, visitDate: v.createdAt, status: v.status })));
    return respond(mockConfig.patients.prescriptions, { prescriptions }, { prescriptions: [] });
  }),

  http.get("*/patients", async ({ request }) => {
    const url = new URL(request.url);
    let items = db.patients;
    const dept = url.searchParams.get("department") ?? url.searchParams.get("dept");
    const acuity = url.searchParams.get("acuity");
    const admissionStatus =
      url.searchParams.get("admission_status") ?? url.searchParams.get("status");
    const q = (url.searchParams.get("query") ?? url.searchParams.get("q"))?.toLowerCase();
    if (dept) items = items.filter((p) => p.dept === dept);
    if (acuity) items = items.filter((p) => p.acuity === acuity);
    if (admissionStatus) items = items.filter((p) => p.status === admissionStatus);
    if (q)
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.mrn.toLowerCase().includes(q) ||
          p.nid.toLowerCase().includes(q) ||
          p.phone.toLowerCase().includes(q),
      );
    const page = Number(url.searchParams.get("page") ?? "1");
    const requestedSize = Number(url.searchParams.get("page_size") ?? url.searchParams.get("pageSize") ?? "20");
    const pageSize = Math.max(1, Math.min(requestedSize, 100));
    const total = items.length;
    const paged = items.slice((page - 1) * pageSize, page * pageSize);
    return respond(
      mockConfig.patients.list,
      { patients: paged, total, page, page_size: pageSize },
      { patients: [], total: 0, page, page_size: pageSize },
    );
  }),

  http.post("*/patients/dedup-check", async ({ request }) => {
    const body = await readBody<{ national_id?: string; full_name?: string; dob?: string }>(request);
    const candidates = db.patients.filter((p) => {
      if (body.national_id && p.nid === body.national_id) return true;
      if (body.full_name && body.dob) {
        const a = body.full_name.trim().toLowerCase();
        const b = p.name.trim().toLowerCase();
        const maxLen = Math.max(a.length, b.length);
        const dist = levenshtein(a, b);
        const similarity = maxLen === 0 ? 1 : 1 - dist / maxLen;
        return p.dob === body.dob && similarity > 0.85;
      }
      return false;
    });
    const suspects = candidates.slice(0, 5).map((p) => ({
      patient_id: p.mrn,
      id: p.mrn,
      mrn: p.mrn,
      full_name: p.name,
      dob: p.dob,
      national_id: p.nid,
      match_type: body.national_id && p.nid === body.national_id ? "national_id" : "fuzzy_name_dob",
      similarity: body.national_id && p.nid === body.national_id ? 1 : 0.9,
    }));
    return respond(mockConfig.patients.dedupCheck, { suspects }, { suspects: [] });
  }),

  http.post("*/patients", async ({ request }) => {
    const body = await readBody<Partial<Patient>>(request);
    const patient: Patient = {
      mrn: `P-${String(900000 + db.patients.length).padStart(6, "0")}`,
      name: body.name ?? "Unnamed Patient",
      dob: body.dob ?? "1990-01-01",
      sex: body.sex ?? "M",
      nid: body.nid ?? `3174${String(Date.now()).slice(-12)}`,
      dept: body.dept ?? "GEN",
      doctor: body.doctor ?? "D02",
      acuity: body.acuity ?? "routine",
      status: body.status ?? "outpatient",
      allergies: body.allergies ?? [],
      phone: body.phone ?? "+62 800 0000 000",
      lastVisit: fixtures.TODAY,
      balance: body.balance ?? 0,
      insurer: body.insurer ?? "Self-pay",
    };
    db.patients = [patient, ...db.patients];
    return respond(mockConfig.patients.create, patient, patient);
  }),

  http.patch("*/patients/:id", async ({ params, request }) => {
    const id = String(params.id);
    const index = db.patients.findIndex((p) => p.mrn === id);
    if (index === -1) return notFound("Patient", id);
    const body = await readBody<Partial<Patient>>(request);
    const updated = { ...db.patients[index], ...body, mrn: id };
    db.patients[index] = updated;
    return respond(mockConfig.patients.update, updated, updated);
  }),

  // ---- Appointments -------------------------------------------------------
  http.get("*/appointments", async ({ request }) => {
    const url = new URL(request.url);
    let items = db.appointments;
    const date = url.searchParams.get("date");
    const doctorId = url.searchParams.get("doctor_id");
    const status = url.searchParams.get("status");
    if (date) items = items.filter((a) => a.date === date);
    if (doctorId) items = items.filter((a) => a.doctor === doctorId);
    if (status) items = items.filter((a) => a.status === status);
    return respond(mockConfig.appointments.list, { appointments: items }, { appointments: [] });
  }),

  http.get("*/appointments/:id", async ({ params }) => {
    const id = String(params.id);
    const appointment = db.appointments.find((a) => a.id === id);
    if (!appointment) return notFound("Appointment", id);
    return respond(mockConfig.appointments.list, { appointment }, null as unknown as { appointment: Appointment });
  }),

  http.post("*/appointments", async ({ request }) => {
    const body = await readBody<Partial<Appointment> & { doctor_id?: number; patient_id?: string }>(request);
    // Numeric user id -> fixture doctor code (booking form sends `doctor_id`).
    const resolved = body.doctor_id != null ? doctorCodeForId(body.doctor_id) : body.doctor;
    const code = resolved ?? "D02";
    const date = body.date ?? fixtures.TODAY;
    const time = body.time ?? "09:00";
    const slotTaken = db.appointments.some(
      (a) =>
        a.doctor === code &&
        a.date === date &&
        a.time === time &&
        a.status !== "cancelled" &&
        a.status !== "no_show",
    );
    if (slotTaken) {
      return HttpResponse.json(
        {
          error: {
            code: "slot_taken",
            message: "Slot is taken — choose another time",
            trace_id: `mock-${Math.random().toString(36).slice(2, 10)}`,
          },
        },
        { status: 409 },
      );
    }
    const patient = (body.patient ?? body.patient_id ?? "P-001108") as string;
    const deptCode =
      (code !== "D02" ? fixtures.doctors.find((d) => d.id === code)?.dept : undefined) ??
      body.dept ??
      "GEN";
    const appointment: Appointment = {
      id: `A-${9000 + db.appointments.length}`,
      time,
      patient,
      doctor: code,
      dept: deptCode,
      status: "booked",
      reason: body.reason ?? "Consultation",
      wait: 0,
      date,
      checkedInAt: null,
    };
    db.appointments = [appointment, ...db.appointments];
    return respond(mockConfig.appointments.create, appointment, appointment);
  }),

  http.get("*/doctors/:id/schedule", async ({ params, request }) => {
    const id = String(params.id);
    const state = ensureAvailability(id);
    const url = new URL(request.url);
    const date = url.searchParams.get("date") ?? todayIso();
    const code = doctorCodeForId(id);
    const day = buildMockDay(state, date, code);
    return respond(
      mockConfig.appointments.schedule,
      { doctor_id: Number(id), date, slots: day.slots },
      { doctor_id: Number(id), date, slots: [] },
    );
  }),

  http.post("*/appointments/:id/check-in", async ({ params }) => {
    const id = String(params.id);
    const index = db.appointments.findIndex((a) => a.id === id);
    if (index === -1) return notFound("Appointment", id);
    const updated: Appointment = {
      ...db.appointments[index],
      status: "checked_in",
      checkedInAt: new Date().toISOString(),
    };
    db.appointments[index] = updated;
    return respond(mockConfig.appointments.checkIn, updated, updated);
  }),

  // ---- Doctor availability & blocked days (ticket #48) --------------------
  http.get("*/doctors/:id/availability", async ({ params, request }) => {
    const id = String(params.id);
    const state = ensureAvailability(id);
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? todayIso();
    const to = url.searchParams.get("to") ?? addDays(from, 6);
    const payload: DoctorAvailability = {
      doctor_id: Number(id),
      windows: state.windows,
      blocked_days: state.blockedDays,
      week: buildMockWeek(state, id, from, to),
    };
    const emptyPayload: DoctorAvailability = {
      doctor_id: Number(id),
      windows: [],
      blocked_days: [],
      week: [],
    };
    return respond(mockConfig.doctorAvailability.get, payload, emptyPayload);
  }),

  http.put("*/doctors/:id/availability", async ({ params, request }) => {
    const id = String(params.id);
    const state = ensureAvailability(id);
    const body = await readBody<{ windows?: WindowCandidate[] }>(request);
    const windows = body.windows ?? [];
    for (const w of windows) {
      const err = validateWindow(
        { day_of_week: w.day_of_week, start_time: w.start_time, end_time: w.end_time },
        [],
      );
      if (err) return errorResponse("validation_error", err, 422);
      if (
        w.department_id != null &&
        (w.department_id < 1 || w.department_id > fixtures.allDepartments.length)
      ) {
        return errorResponse("validation_error", `Unknown department_id ${w.department_id}`, 422);
      }
    }
    for (let i = 0; i < windows.length; i++) {
      for (let j = i + 1; j < windows.length; j++) {
        const a = windows[i];
        const b = windows[j];
        if (
          a.day_of_week === b.day_of_week &&
          rangesOverlap(
            clockToMinutes(a.start_time),
            clockToMinutes(a.end_time),
            clockToMinutes(b.start_time),
            clockToMinutes(b.end_time),
          )
        ) {
          return errorResponse(
            "validation_error",
            `Overlapping windows on weekday ${a.day_of_week} (window ${i + 1} and ${j + 1})`,
            422,
          );
        }
      }
    }
    state.windows = windows.map((w, index) => ({
      id: state.seq + index,
      day_of_week: w.day_of_week,
      start_time: w.start_time,
      end_time: w.end_time,
      department_id: w.department_id ?? null,
    }));
    state.seq += windows.length;
    return respond(
      mockConfig.doctorAvailability.update,
      { doctor_id: Number(id), windows: state.windows },
      { doctor_id: Number(id), windows: [] },
    );
  }),

  http.post("*/doctors/:id/blocked-days", async ({ params, request }) => {
    const id = String(params.id);
    const state = ensureAvailability(id);
    const body = await readBody<{
      blocked_date?: string;
      start_time?: string;
      end_time?: string;
      reason?: string;
    }>(request);
    const blockErr = validateBlock({
      blocked_date: body.blocked_date ?? "",
      start_time: body.start_time ?? "",
      end_time: body.end_time ?? "",
      reason: body.reason ?? "",
    });
    if (blockErr) return errorResponse("validation_error", blockErr, 422);
    const date = body.blocked_date ?? todayIso();
    const code = doctorCodeForId(id);
    const appts = code
      ? db.appointments.filter(
          (a) =>
            a.doctor === code &&
            a.date === date &&
            a.status !== "cancelled" &&
            a.status !== "no_show",
        )
      : [];
    const hasStart = Boolean(body.start_time);
    const conflicts = hasStart
      ? appts.filter((a) => {
          const aStart = clockToMinutes(a.time);
          return rangesOverlap(
            clockToMinutes(body.start_time ?? ""),
            clockToMinutes(body.end_time ?? ""),
            aStart,
            aStart + 30,
          );
        })
      : appts;
    if (conflicts.length) {
      const conflictsPayload: BlockedDayConflict[] = conflicts.map((a) => ({
        id: Number(a.id.replace(/\D/g, "")),
        patient_id: a.patient,
        patient_name: db.patients.find((p) => p.mrn === a.patient)?.name ?? null,
        scheduled_start: `${a.date}T${a.time}:00Z`,
        scheduled_end: `${a.date}T${minutesToClock(clockToMinutes(a.time) + 30)}:00Z`,
      }));
      return HttpResponse.json(
        {
          error: {
            code: "blocked_day_conflicts",
            message: `Block conflicts with ${conflicts.length} appointment(s)`,
            trace_id: `mock-${Math.random().toString(36).slice(2, 10)}`,
          },
          conflicts: conflictsPayload,
        },
        { status: 409 },
      );
    }
    const block: BlockedDay = {
      id: state.seq++,
      blocked_date: date,
      start_time: body.start_time ?? null,
      end_time: body.end_time ?? null,
      reason: body.reason ?? "",
    };
    state.blockedDays.push(block);
    return respond(mockConfig.doctorAvailability.block, block, block);
  }),

  http.delete("*/doctors/:id/blocked-days/:blockedId", async ({ params }) => {
    const id = String(params.id);
    const blockedId = Number(params.blockedId);
    const state = ensureAvailability(id);
    const index = state.blockedDays.findIndex((b) => b.id === blockedId);
    if (index === -1) return notFound("Blocked period", String(blockedId));
    state.blockedDays.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // ---- Admin reference data ----------------------------------------------
  http.get("*/admin/departments", async () => {
    const departments = fixtures.allDepartments.map((d, i) => {
      const occupied = db.patients.filter((p) => p.dept === d.id && p.status === "admitted").length;
      const capacity = d.beds;
      return {
        id: i + 1,
        code: d.id,
        name: d.name,
        type: d.type,
        bed_capacity: capacity,
        occupied_beds: occupied,
        total_beds: capacity,
        occupancy_pct: capacity > 0 ? Math.round((occupied / capacity) * 1000) / 10 : 0,
        min_clinicians_per_shift: d.minCliniciansPerShift,
        active: d.active ? 1 : 0,
      };
    });
    return respond(mockConfig.admin.departments, { departments }, { departments: [] });
  }),

  http.get("*/admin/users/:id", async ({ params }) => {
    const index = Number(params.id) - 1;
    const user = db.users[index];
    if (!user) return notFound("User", String(params.id));
    return respond(mockConfig.admin.user, toAuthUser(user, index), null as unknown as AuthUser);
  }),

  // ---- Admin user management (ticket #8) ---------------------------------
  http.get("*/admin/users", async ({ request }) => {
    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    let users = db.users;
    if (role) users = users.filter((u) => u.role.toLowerCase() === role);
    const rows = users.map(toAdminUser);
    return respond(mockConfig.admin.usersList, { users: rows }, { users: [] });
  }),

  http.patch("*/admin/users/:id", async ({ params, request }) => {
    const id = Number(params.id);
    const index = id - 1;
    const user = db.users[index];
    if (!user) return notFound("User", String(id));
    const body = await readBody<{ role?: Role; department_id?: number; specialisation?: string; is_active?: boolean }>(request);
    const dept =
      body.department_id != null ? deptCodeForId(body.department_id) : user.dept;
    db.users[index] = {
      ...user,
      role: body.role ? ROLE_DISPLAY[body.role] : user.role,
      dept,
      status: body.is_active === false ? "inactive" : body.is_active === true ? "active" : user.status,
    };
    db.auditLog = [
      {
        id: `AUD-${8000 + db.auditLog.length}`,
        actorUserId: 1,
        action: "admin.user_update",
        entityType: "user",
        entityId: String(id),
        createdAt: new Date().toISOString(),
      },
      ...db.auditLog,
    ];
    return respond(mockConfig.admin.userPatch, toAdminUser(db.users[index], index), null as unknown as AdminUser);
  }),

  http.post("*/admin/users/:id/deactivate", async ({ params }) => {
    const id = Number(params.id);
    const index = id - 1;
    const user = db.users[index];
    if (!user) return notFound("User", String(id));
    db.users[index] = { ...user, status: "inactive" };
    db.auditLog = [
      {
        id: `AUD-${8000 + db.auditLog.length}`,
        actorUserId: 1,
        action: "admin.user_deactivate",
        entityType: "user",
        entityId: String(id),
        createdAt: new Date().toISOString(),
      },
      ...db.auditLog,
    ];
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("*/admin/users/:id/my-patients", async ({ params, request }) => {
    const userId = String(params.id);
    const url = new URL(request.url);
    const shiftDate = url.searchParams.get("shift_date") ?? todayIso();
    const user = db.users[Number(userId) - 1];
    if (!user) return notFound("User", userId);
    const depts = db.departmentStaff
      .filter((d) => d.userId === user.id)
      .map((d) => d.departmentId);
    const patients: MyPatient[] = db.patients
      .filter((p) => depts.length === 0 || depts.includes(p.dept))
      .slice(0, 12)
      .map((p, i) => ({
        assignment_id: `${userId}-${p.mrn}`,
        patient_id: p.mrn,
        mrn: p.mrn,
        full_name: p.name,
        acuity: p.acuity,
        admission_status: p.status,
        primary_department_id: departmentId(p.dept),
        bed_label: p.status === "admitted" ? `Ward ${p.dept} · Bed ${(i % 20) + 1}` : null,
        allergies: fixtures.patientAllergies.filter((a) => a.patient === p.mrn),
        vitals_due: p.mrn === "P-001213",
      }));
    return respond(
      mockConfig.admin.myPatients,
      { shift_date: shiftDate, user_id: Number(userId), patients },
      { shift_date: shiftDate, user_id: Number(userId), patients: [] },
    );
  }),

  // ---- Admin departments (ticket #9) -------------------------------------
  http.get("*/admin/departments/:id", async ({ params }) => {
    const id = Number(params.id);
    const dept = fixtures.allDepartments[id - 1];
    if (!dept) return notFound("Department", String(id));
    const occ = db.patients.filter((p) => p.dept === dept.id && p.status === "admitted").length;
    const payload = {
      id,
      code: dept.id,
      name: dept.name,
      type: dept.type,
      bed_capacity: dept.beds,
      active: dept.active ? 1 : 0,
      occupied_beds: occ,
      min_clinicians_per_shift: dept.minCliniciansPerShift,
    };
    return respond(mockConfig.admin.departmentDetail, { department: payload }, null as unknown as { department: ApiDepartment });
  }),

  http.get("*/admin/departments/:id/capacity", async ({ params }) => {
    const id = Number(params.id);
    const dept = fixtures.allDepartments[id - 1];
    if (!dept) return notFound("Department", String(id));
    const occ = db.patients.filter((p) => p.dept === dept.id && p.status === "admitted").length;
    const cap = dept.beds;
    const staffCount = db.departmentStaff.filter((d) => d.departmentId === dept.id).length;
    const payload: DepartmentCapacity = {
      department: { id, code: dept.id, name: dept.name, type: dept.type, bed_capacity: cap, active: dept.active ? 1 : 0 },
      bed_capacity: cap,
      occupied_beds: occ,
      available_beds: Math.max(0, cap - occ),
      min_clinicians_per_shift: dept.minCliniciansPerShift,
      assigned_staff_count: staffCount,
      pressure: cap > 0 ? Math.round((occ / cap) * 100) / 100 : 0,
    };
    return respond(mockConfig.admin.departmentCapacity, payload, null as unknown as DepartmentCapacity);
  }),

  http.post("*/admin/departments", async ({ request }) => {
    const body = await readBody<Partial<ApiDepartment> & { min_clinicians_per_shift?: number }>(request);
    if (body.code && fixtures.allDepartments.some((d) => d.id === body.code)) {
      return errorResponse("duplicate_code", `Department code ${body.code} already exists`, 409);
    }
    const id = fixtures.allDepartments.length + 1;
    const dept: ApiDepartment = {
      id,
      code: body.code ?? `D${String(id).padStart(3, "0")}`,
      name: body.name ?? "New department",
      type: body.type ?? "general",
      bed_capacity: body.bed_capacity ?? 0,
      active: body.active ?? 1,
    };
    db.auditLog = [
      {
        id: `AUD-${8000 + db.auditLog.length}`,
        actorUserId: 1,
        action: "admin.department_create",
        entityType: "department",
        entityId: String(id),
        createdAt: new Date().toISOString(),
      },
      ...db.auditLog,
    ];
    return respond(mockConfig.admin.departmentCreate, { department: dept }, null as unknown as { department: ApiDepartment });
  }),

  http.get("*/admin/department-staff", async ({ request }) => {
    const url = new URL(request.url);
    const deptCode = url.searchParams.get("department_id")
      ? deptCodeForId(Number(url.searchParams.get("department_id")))
      : null;
    const assignments: DepartmentStaffAssignment[] = db.departmentStaff
      .filter((d) => !deptCode || d.departmentId === deptCode)
      .map((d, i) => ({
        id: i + 1,
        department_id: d.departmentId,
        department_name: deptNameForId(departmentId(d.departmentId)),
        user_id: d.userId,
        user_email: db.users.find((u) => u.id === d.userId)?.email ?? "",
        full_name: db.users.find((u) => u.id === d.userId)?.name ?? d.userId,
        assigned_at: d.assignedAt,
      }));
    return respond(mockConfig.admin.departmentStaff, { assignments }, { assignments: [] });
  }),

  http.delete("*/admin/department-staff/:id", async ({ params }) => {
    const id = Number(params.id);
    const index = id - 1;
    if (index < 0 || index >= db.departmentStaff.length) return notFound("Assignment", String(id));
    db.departmentStaff.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // ---- Medical records ----------------------------------------------------
  http.get("*/medical-records/:patientId/visits", async ({ params }) => {
    const patientId = String(params.patientId);
    const visits = db.visitNotes.filter((v) => v.patient === patientId);
    return respond(mockConfig.records.visits, { visits }, { visits: [] });
  }),

  http.post("*/medical-records/:patientId/visits", async ({ params, request }) => {
    const patientId = String(params.patientId);
    const body = await readBody<Partial<VisitNote>>(request);
    const visit: VisitNote = {
      id: `VN-${9100 + db.visitNotes.length}`,
      appointmentId: body.appointmentId ?? null,
      patient: patientId,
      doctor: body.doctor ?? "D02",
      dept: body.dept ?? "GEN",
      chiefComplaint: body.chiefComplaint ?? "",
      diagnosis: body.diagnosis ?? "",
      clinicalNotes: body.clinicalNotes ?? "",
      status: "draft",
      signedAt: null,
      createdAt: new Date().toISOString(),
      prescriptions: [],
    };
    db.visitNotes = [visit, ...db.visitNotes];
    return respond(mockConfig.records.createVisit, visit, visit);
  }),

  // ---- Medical record timeline / per-visit / doctor worklist --------------
  http.get("*/medical-records/patients/:id/history", async ({ params }) => {
    const id = String(params.id);
    const patient = db.patients.find((p) => p.mrn === id);
    if (!patient) return notFound("Patient", id);
    const events: HistoryEvent[] = [
      ...db.visitNotes
        .filter((v) => v.patient === id)
        .map((v) => ({
          timestamp: v.createdAt,
          type: "visit" as const,
          department_code: v.dept,
          summary: v.diagnosis || "Visit note",
          source_id: v.id,
          signed: Boolean(v.signedAt),
        })),
      ...db.visitNotes
        .filter((v) => v.patient === id)
        .flatMap((v) =>
          v.prescriptions.map((r) => ({
            timestamp: v.createdAt,
            type: "prescription" as const,
            department_code: v.dept,
            summary: `Rx: ${r.medication}`,
            source_id: r.id,
            signed: false,
          })),
        ),
      ...db.vitals
        .filter((v) => v.patient === id)
        .map((v) => ({
          timestamp: v.recordedAt,
          type: "vitals" as const,
          department_code: null,
          summary: "Vitals reading",
          source_id: v.id,
          signed: false,
        })),
      ...db.carePlanItems
        .filter((c) => c.patient === id)
        .map((c) => ({
          timestamp: c.dueAt,
          type: "care_plan" as const,
          department_code: null,
          summary: c.description,
          source_id: c.id,
          signed: false,
        })),
      ...db.invoices
        .filter((i) => i.patient === id)
        .map((i) => ({
          timestamp: `${i.date}T09:00:00.000Z`,
          type: "billing" as const,
          department_code: null,
          summary: `Invoice ${i.id} (${i.insurer})`,
          source_id: i.id,
          signed: false,
        })),
    ].sort((a, b) => String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? "")));
    return respond(mockConfig.records.history, { patient_id: id, events }, { patient_id: id, events: [] });
  }),

  http.get("*/medical-records/visits/:id", async ({ params }) => {
    const id = String(params.id);
    const visit = db.visitNotes.find((v) => v.id === id);
    if (!visit) return notFound("Visit", id);
    return respond(mockConfig.records.visit, { visit }, null as unknown as { visit: VisitNote });
  }),

  http.get("*/medical-records/visits", async ({ request }) => {
    const url = new URL(request.url);
    const doctorCode = url.searchParams.get("doctor_id");
    const state = url.searchParams.get("state");
    let items = db.visitNotes;
    if (doctorCode) items = items.filter((v) => v.doctor === doctorCode);
    if (state) items = items.filter((v) => v.status === state);
    return respond(mockConfig.records.visits, { visits: items }, { visits: [] });
  }),

  http.get("*/medical-records/vitals/review-queue", async () => {
    const since = Date.now() - 24 * 3600 * 1000;
    const queue: ReviewQueueEntry[] = db.vitals
      .filter((v) => Date.parse(v.recordedAt) >= since)
      .filter(
        (v) =>
          (v.systolic != null && v.systolic > 180) ||
          (v.spo2 != null && v.spo2 < 90) ||
          (v.heartRate != null && (v.heartRate > 130 || v.heartRate < 40)),
      )
      .map((v) => ({
        id: v.id,
        patient_id: v.patient,
        patient_mrn: v.patient,
        patient_name: patientName(v.patient),
        recorded_at_iso: v.recordedAt,
        systolic: v.systolic,
        diastolic: v.diastolic,
        heart_rate: v.heartRate,
        spo2: v.spo2,
        temperature_c: v.temperatureC,
        respiratory_rate: v.respiratoryRate,
        critical: true,
      }));
    return respond(
      mockConfig.records.reviewQueue,
      { queue, window_hours: 24, count: queue.length },
      { queue: [], window_hours: 24, count: 0 },
    );
  }),

  http.get("*/medical-records/patients/:id/care-plan", async ({ params }) => {
    const id = String(params.id);
    const patient = db.patients.find((p) => p.mrn === id);
    if (!patient) return notFound("Patient", id);
    const items = db.carePlanItems
      .filter((c) => c.patient === id && !c.completed)
      .sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)));
    return respond(mockConfig.records.carePlan, { patient_id: id, items }, { patient_id: id, items: [] });
  }),

  http.post("*/medical-records/care-plan/:itemId/complete", async ({ params }) => {
    const itemId = String(params.itemId);
    const index = db.carePlanItems.findIndex((c) => c.id === itemId);
    if (index === -1) return notFound("Care plan item", itemId);
    db.carePlanItems[index] = { ...db.carePlanItems[index], completed: true, completedBy: "U-104" };
    return respond(mockConfig.records.carePlan, db.carePlanItems[index], db.carePlanItems[index]);
  }),

  http.post("*/medical-records/visits/:visitId/sign", async ({ params }) => {
    const visitId = String(params.visitId);
    const index = db.visitNotes.findIndex((v) => v.id === visitId);
    if (index === -1) return notFound("Visit", visitId);
    if (db.visitNotes[index].signedAt) {
      return errorResponse("visit_already_signed", "Visit is already signed", 409);
    }
    db.visitNotes[index] = {
      ...db.visitNotes[index],
      status: "signed",
      signedAt: new Date().toISOString(),
    };
    return new HttpResponse(null, { status: 204 });
  }),

  http.post("*/medical-records/visits/:visitId/prescriptions", async ({ params, request }) => {
    const visitId = String(params.visitId);
    const visit = db.visitNotes.find((v) => v.id === visitId);
    if (!visit) return notFound("Visit", visitId);
    const body = await readBody<Partial<Prescription>>(request);
    const medication = String(body.medication ?? "");
    // Server-enforced allergy block: penicillin-allergic patients cannot get
    // amoxicillin/penicillin-family drugs (mirrors the backend rule from #21).
    const allergies: PatientAllergy[] = fixtures.patientAllergies.filter(
      (a) => a.patient === visit.patient && a.severity === "severe",
    );
    const medLower = medication.toLowerCase();
    const blocked = allergies.find((a) => {
      const allergen = a.substance.toLowerCase();
      if (medLower.includes(allergen)) return true;
      if (allergen === "penicillin" && medLower.includes("amoxicillin")) return true;
      if (allergen === "penicillin" && medLower.includes("ampicillin")) return true;
      return false;
    });
    if (blocked) {
      return HttpResponse.json(
        {
          error: {
            code: "allergy_contraindication",
            message: "Patient allergy blocks this medication",
            trace_id: `mock-${Math.random().toString(36).slice(2, 10)}`,
          },
          matched_medication_class: medLower,
          allergens: [
            { allergen: blocked.substance, severity: blocked.severity, reaction: null },
          ],
        },
        { status: 422 },
      );
    }
    const rx: Prescription = {
      id: `PR-${9700 + db.visitNotes.reduce((n, v) => n + v.prescriptions.length, 0)}`,
      visitNoteId: visitId,
      medication,
      dosage: body.dosage ?? "",
      frequency: body.frequency ?? "",
      durationDays: body.durationDays ?? 30,
    };
    const visitIndex = db.visitNotes.findIndex((v) => v.id === visitId);
    db.visitNotes[visitIndex] = {
      ...db.visitNotes[visitIndex],
      prescriptions: [...db.visitNotes[visitIndex].prescriptions, rx],
    };
    return respond(mockConfig.records.createVisit, rx, rx);
  }),

  // ---- Vitals -------------------------------------------------------------
  http.get("*/vitals", async ({ request }) => {
    const url = new URL(request.url);
    const patient = url.searchParams.get("patient");
    let items = db.vitals;
    if (patient) items = items.filter((v) => v.patient === patient);
    const limit = Number(url.searchParams.get("limit") ?? "0");
    if (limit > 0) items = items.slice(0, limit);
    return respond(mockConfig.vitals.list, { vitals: items }, { vitals: [] });
  }),

  http.post("*/vitals", async ({ request }) => {
    const body = await readBody<Partial<Vitals>>(request);
    const reading: Vitals = {
      id: `V-${9500 + db.vitals.length}`,
      patient: body.patient ?? "P-001042",
      recordedAt: new Date().toISOString(),
      systolic: body.systolic ?? 120,
      diastolic: body.diastolic ?? 80,
      heartRate: body.heartRate ?? 72,
      spo2: body.spo2 ?? 98,
      temperatureC: body.temperatureC ?? 36.8,
      respiratoryRate: body.respiratoryRate ?? 16,
      recordedBy: body.recordedBy ?? "U-104",
      overdue: false,
    };
    db.vitals = [reading, ...db.vitals];
    return respond(mockConfig.vitals.create, reading, reading);
  }),

  http.post("*/patients/:id/care-plan/:itemId/complete", async ({ params }) => {
    const itemId = String(params.itemId);
    const index = db.carePlanItems.findIndex((c) => c.id === itemId);
    if (index === -1) return notFound("Care plan item", itemId);
    db.carePlanItems[index] = {
      ...db.carePlanItems[index],
      completed: true,
      completedBy: "U-104",
    };
    return respond(
      mockConfig.vitals.create,
      db.carePlanItems[index],
      db.carePlanItems[index],
    );
  }),

  // ---- Billing ------------------------------------------------------------
  http.get("*/invoices", async ({ request }) => {
    const url = new URL(request.url);
    const patient = url.searchParams.get("patient");
    const status = url.searchParams.get("status");
    let items = db.invoices;
    if (patient) items = items.filter((i) => i.patient === patient);
    if (status) items = items.filter((i) => i.status === status);
    return respond(mockConfig.invoices.list, { invoices: items }, { invoices: [] });
  }),

  http.post("*/invoices", async ({ request }) => {
    const body = await readBody<Partial<Invoice>>(request);
    const invoice: Invoice = {
      id: `INV-2026-${String(1000 + db.invoices.length).slice(-4)}`,
      patient: body.patient ?? "P-001042",
      date: body.date ?? fixtures.TODAY,
      total: body.total ?? 0,
      paid: 0,
      status: "unpaid",
      insurer: body.insurer ?? "Self-pay",
      claim: "none",
      lines: body.lines ?? [],
    };
    db.invoices = [invoice, ...db.invoices];
    return respond(mockConfig.invoices.create, invoice, invoice);
  }),

  http.post("*/invoices/:id/payments", async ({ params, request }) => {
    const id = String(params.id);
    const index = db.invoices.findIndex((i) => i.id === id);
    if (index === -1) return notFound("Invoice", id);
    const body = await readBody<Partial<Payment>>(request);
    const amount = body.amount ?? 0;
    const payment: Payment = {
      id: `PAY-${3000 + db.payments.length}`,
      invoiceId: id,
      amount,
      method: body.method ?? "cash",
      reference: body.reference ?? null,
      paidAt: new Date().toISOString(),
    };
    db.payments = [payment, ...db.payments];
    const invoice = db.invoices[index];
    const paid = invoice.paid + amount;
    db.invoices[index] = {
      ...invoice,
      paid,
      status: paid >= invoice.total ? "paid" : paid > 0 ? "partially_paid" : "unpaid",
    };
    return respond(mockConfig.invoices.payment, payment, payment);
  }),

  http.get("*/invoices/:id", async ({ params }) => {
    const id = String(params.id);
    const invoice = db.invoices.find((i) => i.id === id);
    if (!invoice) return notFound("Invoice", id);
    const payments = db.payments.filter((p) => p.invoiceId === id);
    const claims = db.claims.filter((c) => c.invoiceId === id);
    return respond(
      mockConfig.invoices.detail,
      { invoice, line_items: invoice.lines, payments, claims },
      { invoice: null as unknown as Invoice, line_items: [], payments: [], claims: [] },
    );
  }),

  http.get("*/claims", async ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    let items = db.claims;
    if (status) items = items.filter((c) => c.status === status);
    return respond(mockConfig.invoices.claims, { claims: items }, { claims: [] });
  }),

  // ---- Permissions (admin) ------------------------------------------------
  http.get("*/permissions", async () => {
    return respond(
      mockConfig.permissions.get,
      { permissions: db.permissions },
      { permissions: [] },
    );
  }),

  http.put("*/permissions/:role/:module", async ({ params, request }) => {
    const role = String(params.role) as Role;
    const moduleName = String(params.module);
    const body = await readBody<{ allowed: boolean }>(request);
    const index = db.permissions.findIndex((p) => p.role === role && p.module === moduleName);
    if (index === -1) return notFound("Permission", `${role}/${moduleName}`);
    db.permissions[index] = { ...db.permissions[index], allowed: body.allowed, canView: body.allowed };
    return respond(mockConfig.permissions.put, db.permissions[index], db.permissions[index]);
  }),

  // ---- Widgets ------------------------------------------------------------
  http.get("*/widgets/admin/library", async () => {
    return respond(mockConfig.widgets.library, { widgets: db.widgets }, { widgets: [] });
  }),

  http.put("*/widgets/admin/library/:id", async ({ params, request }) => {
    const id = String(params.id);
    const index = db.widgets.findIndex((w) => w.key === id);
    if (index === -1) return notFound("Widget", id);
    const body = await readBody<Partial<Widget>>(request);
    db.widgets[index] = { ...db.widgets[index], ...body, key: id };
    db.auditLog = [
      {
        id: `AUD-${8000 + db.auditLog.length}`,
        actorUserId: 1,
        action: "widget.lock_toggle",
        entityType: "widget",
        entityId: id,
        createdAt: new Date().toISOString(),
      },
      ...db.auditLog,
    ];
    return respond(mockConfig.widgets.update, db.widgets[index], db.widgets[index]);
  }),

  http.get("*/widgets/me", async ({ request }) => {
    const role = roleFromRequest(request, "doctor");
    const display = ROLE_DISPLAY[role];
    const userId = ROLE_TO_USER[role];
    const layout = db.widgetLayouts.filter((l) => l.userId === userId);
    const resolved = db.widgets
      .filter((w) => w.roles.includes(display))
      .map((w) => {
        const entry = layout.find((l) => l.widgetKey === w.key);
        return { ...w, enabled: w.locked ? true : (entry?.enabled ?? w.enabled) };
      });
    return respond(
      mockConfig.widgets.me,
      { widgets: resolved, layout },
      { widgets: [], layout: [] },
    );
  }),

  http.put("*/widgets/me", async ({ request }) => {
    const body = await readBody<{ userId?: string; role?: Role; layout: WidgetLayout[] }>(request);
    const userId = body.userId ?? ROLE_TO_USER[body.role ?? "doctor"];
    db.widgetLayouts = [...db.widgetLayouts.filter((l) => l.userId !== userId), ...body.layout];
    const layout = db.widgetLayouts.filter((l) => l.userId === userId);
    return respond(mockConfig.widgets.saveMe, { layout }, { layout: [] });
  }),

  // ---- Auth ---------------------------------------------------------------
  http.post("*/auth/login", async ({ request }) => {
    const body = await readBody<{ email?: string; password?: string }>(request);
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    const index = db.users.findIndex((u) => u.email.toLowerCase() === email);
    if (index === -1 || password !== DEMO_PASSWORD) {
      return errorResponse(
        "invalid_credentials",
        "Email or password is incorrect. Use one of the demo accounts (password Hospital2025!).",
        401,
      );
    }
    const user = db.users[index];
    const role = user.role.toLowerCase() as Role;
    const authUser = toAuthUser(user, index);
    const payload: LoginResponse = {
      access_token: `mock_${role}_${Math.random().toString(36).slice(2, 10)}`,
      refresh_token: `mock_r_${Math.random().toString(36).slice(2, 12)}`,
      token_type: "bearer",
      user: authUser,
    };
    return respond(mockConfig.auth.login, payload, payload);
  }),

  http.post("*/auth/logout", async () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("*/auth/me", async ({ request }) => {
    const role = roleFromToken(request) ?? roleFromRequest(request, "admin");
    const userIndex = db.users.findIndex((u) => u.role.toLowerCase() === role);
    if (userIndex === -1) return notFound("User", role);
    const user = db.users[userIndex];
    const permissions = db.permissions
      .filter((p) => p.role === role)
      .map((p) => ({ module: p.module, allowed: p.allowed }));
    const session: AuthSession = {
      id: userIndex + 1,
      email: user.email,
      full_name: user.name,
      role,
      department_id: user.dept === "—" ? null : departmentId(user.dept),
      permissions,
    };
    return respond(mockConfig.auth.me, session, session);
  }),

  http.get("*/auth/users", async () => {
    const users = db.users.map(toAuthUser);
    return respond(mockConfig.auth.users, { users }, { users: [] });
  }),

  http.post("*/auth/users", async ({ request }) => {
    const body = await readBody<Partial<User> & { role?: Role }>(request);
    const user: User = {
      id: `U-${300 + db.users.length}`,
      name: body.name ?? "New Staff",
      email: body.email ?? "new.staff@sirkaya.health",
      role: (body.role ? ROLE_DISPLAY[body.role] : "Receptionist") as RoleDisplay,
      dept: body.dept ?? "—",
      status: "invited",
      lastLogin: "—",
      mfa: false,
    };
    db.users = [...db.users, user];
    db.auditLog = [
      {
        id: `AUD-${8000 + db.auditLog.length}`,
        actorUserId: 1,
        action: "admin.user_create",
        entityType: "user",
        entityId: user.id,
        createdAt: new Date().toISOString(),
      },
      ...db.auditLog,
    ];
    return respond(mockConfig.auth.createUser, toAuthUser(user, db.users.length - 1), toAuthUser(user, db.users.length - 1));
  }),

  http.post("*/admin/department-staff", async ({ request }) => {
    const body = await readBody<{ userId?: string; departmentId?: string }>(request);
    if (!body.userId || !body.departmentId) {
      return errorResponse("validation_error", "user_id and department_id are required", 422);
    }
    const duplicate = db.departmentStaff.find(
      (d) => d.userId === body.userId && d.departmentId === body.departmentId,
    );
    if (duplicate) return errorResponse("already_assigned", "Already assigned", 409);
    const assignment: DepartmentStaff = {
      departmentId: body.departmentId,
      userId: body.userId,
      assignedAt: new Date().toISOString(),
    };
    db.departmentStaff = [assignment, ...db.departmentStaff];
    db.auditLog = [
      {
        id: `AUD-${8000 + db.auditLog.length}`,
        actorUserId: 1,
        action: "admin.staff_assign",
        entityType: "department_staff",
        entityId: body.userId,
        createdAt: new Date().toISOString(),
      },
      ...db.auditLog,
    ];
    return respond(mockConfig.admin.departments, assignment, null as unknown as DepartmentStaff);
  }),

  // ---- Audit --------------------------------------------------------------
  http.get("*/audit-log", async () => {
    return respond(mockConfig.audit.list, { entries: db.auditLog }, { entries: [] });
  }),
];

// ---------------------------------------------------------------------------
// Fallback: an unhandled API path returns an explicit 404, never a hang.
// Scoped to known API roots so it cannot swallow Next.js assets or RSC calls.
// ---------------------------------------------------------------------------

const API_ROOTS = [
  "patients",
  "appointments",
  "doctors",
  "medical-records",
  "vitals",
  "invoices",
  "permissions",
  "widgets",
  "auth",
  "admin",
  "audit-log",
];

export function isApiRequest(rawUrl: string): boolean {
  try {
    const root = new URL(rawUrl).pathname.split("/").filter(Boolean)[0];
    return root !== undefined && API_ROOTS.includes(root);
  } catch {
    return false;
  }
}

export const fallbackHandler = http.all(
  ({ request }) => isApiRequest(request.url),
  ({ request }) =>
    errorResponse(
      "no_handler",
      `No mock handler registered for ${request.method} ${new URL(request.url).pathname}`,
      404,
    ),
);
