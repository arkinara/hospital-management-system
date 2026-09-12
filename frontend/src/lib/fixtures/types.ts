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

// ---------------------------------------------------------------------------
// Doctor availability / blocked days (ticket #48)
// ---------------------------------------------------------------------------

export interface AvailabilityWindow {
  id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  department_id: number | null;
}

export interface BlockedDay {
  id: number;
  blocked_date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string;
}

/** 15-minute grid slot for one doctor/day, matching `get_doctor_slots`. */
export interface ScheduleSlot {
  start: string;
  end: string;
  start_epoch: number;
  end_epoch: number;
  status: "free" | "booked" | "blocked";
  appointment_id: number | null;
  patient_id: number | null;
  reason: string | null;
}

export interface WeekDayData {
  date: string;
  day_of_week: number;
  blocked: boolean;
  capacity: number;
  booked: number;
  slots: ScheduleSlot[];
}

/** Matches `GET /doctors/{id}/availability`. */
export interface DoctorAvailability {
  doctor_id: number;
  windows: AvailabilityWindow[];
  blocked_days: BlockedDay[];
  week: WeekDayData[];
}

/** A blocked-period write that collides with live appointments (409 body). */
export interface BlockedDayConflict {
  id: number;
  patient_id: number | string;
  patient_name: string | null;
  scheduled_start: string;
  scheduled_end: string;
}

/** Backend-shaped department from `GET /admin/departments`. */
export interface ApiDepartment {
  id: number;
  code: string;
  name: string;
  type: string;
  bed_capacity: number;
  active: number;
}

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

/** Matches `GET /widget-config/widgets` — the admin library screen. */
export interface WidgetDefinition {
  key: string;
  name: string;
  desc: string;
  icon: string;
  size: WidgetSize;
  /** The role a fresh user gets for this widget by default. */
  default_role: Role | null;
  globally_enabled: boolean;
  globally_locked: boolean;
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

// ---------------------------------------------------------------------------
// Clinical summary / history (tickets #3, #4, #40)
// ---------------------------------------------------------------------------

/** Matches `GET /patients/{id}/clinical-summary`. */
export interface ClinicalSummary {
  id: number;
  mrn: string;
  full_name: string;
  dob: string;
  sex: "M" | "F";
  phone: string | null;
  email: string | null;
  acuity: Acuity;
  admission_status: PatientStatus;
  is_active: boolean;
  primary_department_id: number | null;
  allergies: PatientAllergy[];
  active_prescriptions_count: number;
  active_appointments_count: number;
}

/** One flattened event from `GET /medical-records/patients/{id}/history`. */
export interface HistoryEvent {
  timestamp: string | null;
  type:
    | "visit"
    | "prescription"
    | "attachment"
    | "vitals"
    | "care_plan"
    | "billing";
  department_code: string | null;
  summary: string;
  source_id: number | string;
  signed: boolean;
}

/** Matches `GET /admin/users/{id}/my-patients` (enriched worklist). */
export interface MyPatient {
  assignment_id: number | string;
  patient_id: number | string;
  mrn: string;
  full_name: string;
  acuity: Acuity;
  admission_status: PatientStatus;
  primary_department_id: number | null;
  bed_label: string | null;
  allergies: PatientAllergy[];
  vitals_due: boolean;
}

/** One entry from `GET /medical-records/vitals/review-queue`. */
export interface ReviewQueueEntry {
  id: number | string;
  patient_id: number | string;
  patient_mrn: string;
  patient_name: string;
  recorded_at_iso: string;
  systolic: number | null;
  diastolic: number | null;
  heart_rate: number | null;
  spo2: number | null;
  temperature_c: number | null;
  respiratory_rate: number | null;
  critical: boolean;
}

// ---------------------------------------------------------------------------
// Admin (tickets #8, #9)
// ---------------------------------------------------------------------------

/** Rich admin user row, matching `GET /admin/users`. */
export interface AdminUser {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  department_id: number | null;
  department_name: string | null;
  specialisation: string | null;
  is_active: boolean;
  created_at: number;
  last_login_at: number | null;
}

/** Capacity payload, matching `GET /admin/departments/{id}/capacity`. */
export interface DepartmentCapacity {
  department: ApiDepartment;
  bed_capacity: number;
  occupied_beds: number;
  available_beds: number;
  min_clinicians_per_shift: number;
  assigned_staff_count: number;
  pressure: number;
}

/** Enriched department-staff assignment with display names. */
export interface DepartmentStaffAssignment {
  id: number | string;
  department_id: number | string;
  department_name: string;
  user_id: number | string;
  user_email: string;
  full_name: string;
  assigned_at: string;
}
