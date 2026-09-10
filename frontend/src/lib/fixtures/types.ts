/**
 * Canonical API types for the Hospital MS shared fixture set (ticket #38).
 *
 * These are the shapes the mock API layer returns today and the real FastAPI
 * endpoints must return tomorrow. The backend seed (`backend/db/seed.py`)
 * consumes the generated `data.json`, so a drift between the two is a
 * type-check failure here rather than a runtime surprise in a screen.
 *
 * Naming follows the prototype contract (`promax-prototype/prototype/data.js`)
 * for clinical entities; the already-shipped auth endpoints keep their
 * snake_case payloads and are typed separately under `Auth*`.
 */

// ---------------------------------------------------------------------------
// Shared enums / unions
// ---------------------------------------------------------------------------

/** System account role, lower-case — matches the RBAC matrix and the backend. */
export type Role = "admin" | "doctor" | "nurse" | "receptionist";

/** Human-facing role label used by the prototype screens. */
export type RoleDisplay = "Admin" | "Doctor" | "Nurse" | "Receptionist";

/** RBAC modules. Kept in sync with `backend/app/dependencies.py::MODULES`. */
export type Module =
  | "patients"
  | "appointments"
  | "records"
  | "billing"
  | "admin"
  | "widget-config"
  | "audit";

/** CRUD actions a permission entry can grant. */
export type PermissionAction = "view" | "create" | "edit" | "delete";

export type DepartmentColor = "info" | "primary" | "accent" | "danger";
export type DepartmentType =
  | "general"
  | "pediatric"
  | "cardiology"
  | "emergency"
  | "neurology";

export type Acuity = "critical" | "urgent" | "standard" | "routine";
export type PatientStatus = "admitted" | "outpatient" | "discharged";
export type AllergySeverity = "mild" | "moderate" | "severe";

export type AppointmentStatus =
  | "booked"
  | "checked_in"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export type SlotStatus = "open" | "booked" | "blocked" | "held";

export type TimelineKind =
  | "vitals"
  | "prescription"
  | "note"
  | "lab"
  | "admission"
  | "procedure"
  | "billing";

export type InvoiceStatus = "draft" | "unpaid" | "partially_paid" | "paid" | "void";

export type ClaimStatus =
  | "none"
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "denied"
  | "settled";

export type VisitNoteStatus = "draft" | "submitted" | "signed";

export type WidgetSize = "sm" | "md" | "lg";

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

export interface Department {
  id: string;
  name: string;
  type: DepartmentType;
  beds: number;
  occupied: number;
  doctors: number;
  color: DepartmentColor;
  /** Minimum clinicians required per shift (admin pressure indicator). */
  minCliniciansPerShift: number;
  /** False when the department has no staff assigned for the current shift. */
  staffed: boolean;
  active: boolean;
}

export interface Doctor {
  id: string;
  /** FK to `users.id` — a doctor is always a staff account. */
  userId: string;
  name: string;
  email: string;
  dept: string;
  spec: string;
  onDuty: boolean;
  shift: string;
}

export interface Allergy {
  substance: string;
  severity: AllergySeverity;
  notedBy: string | null;
  notedAt: string;
}

export interface Patient {
  mrn: string;
  name: string;
  dob: string;
  sex: "M" | "F";
  nid: string;
  dept: string;
  doctor: string;
  acuity: Acuity;
  status: PatientStatus;
  allergies: string[];
  phone: string;
  lastVisit: string;
  balance: number;
  insurer: string;
}

export interface DepartmentStaff {
  departmentId: string;
  userId: string;
  assignedAt: string;
}

export interface PatientAllergy extends Allergy {
  patient: string;
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export interface Slot {
  time: string;
  status: SlotStatus;
  patient?: string;
  reason?: string;
}

export interface Appointment {
  id: string;
  time: string;
  patient: string;
  doctor: string;
  dept: string;
  status: AppointmentStatus;
  reason: string;
  wait: number;
  date: string;
  checkedInAt: string | null;
}

// ---------------------------------------------------------------------------
// Clinical
// ---------------------------------------------------------------------------

export interface TimelineEntry {
  at: string;
  dept: string;
  kind: TimelineKind;
  by: string;
  title: string;
  body: string;
  dx?: string;
  flag?: "normal" | "abnormal";
}

/** Chart series point (the compact shape the sparkline consumes). */
export interface VitalsSeriesPoint {
  at: string;
  sys: number;
  dia: number;
  hr: number;
}

export interface Vitals {
  id: string;
  patient: string;
  recordedAt: string;
  systolic: number;
  diastolic: number;
  heartRate: number;
  spo2: number;
  temperatureC: number;
  respiratoryRate: number;
  recordedBy: string;
  /** True when this is the latest reading and it is past its due window. */
  overdue: boolean;
}

export interface Prescription {
  id: string;
  visitNoteId: string;
  medication: string;
  dosage: string;
  frequency: string;
  durationDays: number;
}

export interface VisitNote {
  id: string;
  appointmentId: string | null;
  patient: string;
  doctor: string;
  dept: string;
  chiefComplaint: string;
  diagnosis: string;
  clinicalNotes: string;
  status: VisitNoteStatus;
  signedAt: string | null;
  createdAt: string;
  prescriptions: Prescription[];
}

export interface CarePlanItem {
  id: string;
  patient: string;
  sourceVisitNoteId: string | null;
  description: string;
  dueAt: string;
  priority: "high" | "normal" | "low";
  completed: boolean;
  completedBy: string | null;
}

export interface PendingRecord {
  id: string;
  patient: string;
  dept: string;
  doctor: string;
  visit: string;
  age: string;
  state: VisitNoteStatus;
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export interface InvoiceLine {
  code: string;
  desc: string;
  qty: number;
  unit: number;
  dept: string;
}

export interface Invoice {
  id: string;
  patient: string;
  date: string;
  total: number;
  paid: number;
  status: InvoiceStatus;
  insurer: string;
  claim: ClaimStatus;
  lines: InvoiceLine[];
}

export interface Claim {
  id: string;
  invoiceId: string;
  payerName: string;
  claimNumber: string;
  status: ClaimStatus;
  denialReason: string | null;
  appealDeadline: string | null;
  submittedAt: string | null;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: "cash" | "card" | "transfer" | "insurance";
  reference: string | null;
  paidAt: string;
}

// ---------------------------------------------------------------------------
// Staff / auth
// ---------------------------------------------------------------------------

/** Prototype display user (what the admin user table renders). */
export interface User {
  id: string;
  name: string;
  email: string;
  role: RoleDisplay;
  dept: string;
  status: "active" | "invited" | "inactive";
  lastLogin: string;
  mfa: boolean;
}

/** Backend-shaped auth user, matching `GET /auth/users`. */
export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  department_id: number | null;
  is_active: boolean;
  created_at: number;
}

/** Matches `GET /auth/me`. */
export interface AuthSession {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  department_id: number | null;
  permissions: Array<{ module: Module; allowed: boolean }>;
}

export interface PermissionMatrixEntry {
  role: Role;
  module: Module;
  allowed: boolean;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/** Prototype permission table: role -> module -> action letters (`vced`). */
export type PermissionTable = Record<RoleDisplay, Record<string, string>>;

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

export interface Widget {
  key: string;
  name: string;
  desc: string;
  size: WidgetSize;
  roles: RoleDisplay[];
  enabled: boolean;
  /** Admin lock wins over any per-user layout. */
  locked: boolean;
  icon: string;
}

export interface WidgetLayout {
  userId: string;
  widgetKey: string;
  positionOrder: number;
  enabled: boolean;
  size: WidgetSize;
}

// ---------------------------------------------------------------------------
// Dashboards / reports
// ---------------------------------------------------------------------------

export interface RevenuePoint {
  d: string;
  billed: number;
  collected: number;
}

export interface ClaimAgingBucket {
  bucket: string;
  count: number;
  value: number;
}

export interface NavItem {
  key: string;
  label: string;
  icon: string;
  href: string | null;
  module: Module | null;
  children?: NavItem[];
}

export interface SessionProfile {
  name: string;
  role: RoleDisplay;
  dept: string;
  initials: string;
}

// ---------------------------------------------------------------------------
// API envelope
// ---------------------------------------------------------------------------

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    trace_id: string;
  };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogEntry {
  id: string;
  actorUserId: number | null;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
}
