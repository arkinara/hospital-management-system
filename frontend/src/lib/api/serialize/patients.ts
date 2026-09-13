/**
 * Patient domain serializer (#57.1).
 *
 * Maps the backend's flat snake_case rows onto the render types the screens
 * were built against. Every field the frontend reads is resolved here, so a
 * backend rename surfaces as an adapter change rather than a blank panel.
 */

import type {
  BackendAllergy,
  BackendClinicalSummary,
  BackendHistoryEvent,
  BackendPatient,
  ClinicalSummary,
  HistoryEvent,
  Patient,
  PatientAllergy,
} from "@/lib/fixtures";
import { toDateOnly, toIso } from "./coerce";

// Visit-note / prescription adapters live in the records serializer; re-export
// so existing patient-screen imports keep working.
export {
  toFrontendPrescription,
  toFrontendVisitNote,
} from "./records";

type Loose = Record<string, unknown>;

function allergySubstance(a: BackendAllergy | string | Loose): string {
  if (typeof a === "string") return a;
  return String((a as Loose).allergen ?? (a as Loose).substance ?? "");
}

export function toFrontendAllergy(row: BackendAllergy | Loose, patientId?: number | string): PatientAllergy {
  const r = row as Loose;
  return {
    substance: String(r.allergen ?? r.substance ?? ""),
    severity: (r.severity as PatientAllergy["severity"]) ?? "mild",
    notedBy: (r.noted_by as string | null) ?? null,
    notedAt: toIso(r.noted_at) ?? "",
    patient: patientId !== undefined ? String(patientId) : String(r.patient_id ?? ""),
  };
}

/**
 * `BackendPatient` (or a legacy fixture `Patient`) -> the render `Patient`.
 * Unknown backend fields become explicit empty values, never `undefined`.
 */
export function toFrontendPatient(row: BackendPatient | Patient | Loose): Patient {
  const r = row as Loose;
  const sexRaw = String(r.sex ?? "").toUpperCase();
  const status = (r.admission_status ?? r.status ?? "outpatient") as Patient["status"];
  const allergies: string[] = Array.isArray(r.allergies)
    ? r.allergies.map(allergySubstance).filter(Boolean)
    : [];
  return {
    mrn: String(r.mrn ?? ""),
    name: String(r.full_name ?? r.name ?? ""),
    dob: toDateOnly(r.dob) || String(r.dob ?? ""),
    sex: sexRaw === "F" ? "F" : "M",
    nid: String(r.national_id ?? r.nid ?? "—"),
    dept: String(r.department_code ?? r.dept ?? "—"),
    doctor: String(r.doctor ?? "—"),
    acuity: (r.acuity as Patient["acuity"]) ?? "routine",
    status,
    allergies,
    phone: String(r.phone ?? "—"),
    lastVisit: toDateOnly(r.last_visit ?? r.lastVisit) || String(r.last_visit ?? r.lastVisit ?? ""),
    balance: Number(r.balance ?? 0),
    insurer: String(r.payer_name ?? r.insurer ?? "Self-pay"),
  };
}

export function toFrontendClinicalSummary(row: BackendClinicalSummary | Loose): ClinicalSummary {
  const r = row as Loose;
  return {
    id: Number(r.id ?? 0),
    mrn: String(r.mrn ?? ""),
    full_name: String(r.full_name ?? ""),
    dob: toDateOnly(r.dob),
    sex: ((String(r.sex ?? "").toUpperCase() === "F" ? "F" : "M") as ClinicalSummary["sex"]),
    phone: (r.phone as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    acuity: (r.acuity as ClinicalSummary["acuity"]) ?? "routine",
    admission_status: (r.admission_status ?? "outpatient") as ClinicalSummary["admission_status"],
    is_active: Boolean(r.is_active ?? true),
    primary_department_id: (r.primary_department_id as number | null) ?? null,
    allergies: Array.isArray(r.allergies)
      ? r.allergies.map((a) => toFrontendAllergy(a as Loose, r.id as number))
      : [],
    active_prescriptions_count: Number(r.active_prescriptions_count ?? 0),
    active_appointments_count: Number(r.active_appointments_count ?? 0),
  };
}

export function toFrontendHistoryEvent(row: BackendHistoryEvent | Loose): HistoryEvent {
  const r = row as Loose;
  return {
    timestamp: toIso(r.timestamp),
    type: r.type as HistoryEvent["type"],
    department_code: (r.department_code as string | null) ?? null,
    summary: String(r.summary ?? ""),
    source_id: r.source_id as number | string,
    signed: Boolean(r.signed),
  };
}


