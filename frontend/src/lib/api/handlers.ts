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
  ApiErrorEnvelope,
  Appointment,
  AuditLogEntry,
  AuthSession,
  AuthUser,
  Claim,
  Department,
  Invoice,
  Patient,
  Payment,
  PermissionMatrixEntry,
  Role,
  RoleDisplay,
  User,
  VisitNote,
  Vitals,
  Widget,
  WidgetLayout,
} from "@/lib/fixtures";
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
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createDb(): MockDb {
  return clone({
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
  });
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

function readBody<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
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
    const timeline = patient.mrn === "P-001042" ? fixtures.timeline : [];
    return respond(mockConfig.patients.timeline, { timeline }, { timeline: [] });
  }),

  http.get("*/patients/:id", async ({ params }) => {
    const id = String(params.id);
    const patient = db.patients.find((p) => p.mrn === id);
    if (!patient) return notFound("Patient", id);
    return respond(mockConfig.patients.detail, patient, null as unknown as Patient);
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

  http.post("*/appointments", async ({ request }) => {
    const body = await readBody<Partial<Appointment>>(request);
    const appointment: Appointment = {
      id: `A-${9000 + db.appointments.length}`,
      time: body.time ?? "09:00",
      patient: body.patient ?? "P-001108",
      doctor: body.doctor ?? "D02",
      dept: body.dept ?? "GEN",
      status: "booked",
      reason: body.reason ?? "Consultation",
      wait: 0,
      date: body.date ?? fixtures.TODAY,
      checkedInAt: null,
    };
    db.appointments = [appointment, ...db.appointments];
    return respond(mockConfig.appointments.create, appointment, appointment);
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
    return respond(mockConfig.auth.createUser, toAuthUser(user, db.users.length - 1), toAuthUser(user, db.users.length - 1));
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
  "medical-records",
  "vitals",
  "invoices",
  "permissions",
  "widgets",
  "auth",
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
