/**
 * Medical-records domain serializer (#57.3).
 *
 * Visit notes, prescriptions, vitals and care-plan rows come back flat and
 * snake_case from the backend. Prescriptions are NOT nested on a visit note —
 * `GET /medical-records/patients/{id}/prescriptions` is a separate call — so the
 * adapter takes them as an explicit argument.
 */

import type {
  BackendCarePlanItem,
  BackendPrescription,
  BackendVisitNote,
  BackendVitals,
  CarePlanItem,
  Prescription,
  VisitNote,
  Vitals,
} from "@/lib/fixtures";
import { toIso } from "./coerce";

type Loose = Record<string, unknown>;

export function toFrontendPrescription(row: BackendPrescription | Loose): Prescription {
  const r = row as Loose;
  return {
    id: String(r.id ?? ""),
    visitNoteId: String(r.visit_note_id ?? ""),
    medication: String(r.medication ?? ""),
    dosage: String(r.dosage ?? ""),
    frequency: String(r.frequency ?? ""),
    durationDays: Number(r.duration_days ?? r.durationDays ?? 0),
  };
}

/** `BackendVisitNote` -> render `VisitNote`; prescriptions supplied separately. */
export function toFrontendVisitNote(
  row: BackendVisitNote | Loose,
  prescriptions: Array<BackendPrescription | Loose> = [],
): VisitNote {
  const r = row as Loose;
  return {
    id: String(r.id ?? ""),
    appointmentId: r.appointment_id != null ? String(r.appointment_id) : null,
    patient: String(r.patient_id ?? r.patient ?? ""),
    doctor: String(r.doctor_id ?? r.doctor ?? "—"),
    dept: String(r.department_id ?? r.dept ?? "—"),
    chiefComplaint: String(r.chief_complaint ?? ""),
    diagnosis: String(r.diagnosis ?? ""),
    clinicalNotes: String(r.clinical_notes ?? ""),
    status: (r.status as VisitNote["status"]) ?? "draft",
    signedAt: toIso(r.signed_at),
    createdAt: toIso(r.created_at) ?? String(r.created_at ?? ""),
    prescriptions: prescriptions.map(toFrontendPrescription),
  };
}

export function toFrontendVitals(row: BackendVitals | Loose): Vitals {
  const r = row as Loose;
  return {
    id: String(r.id ?? ""),
    patient: String(r.patient_id ?? r.patient ?? ""),
    recordedAt: toIso(r.recorded_at) ?? String(r.recorded_at ?? ""),
    systolic: Number(r.systolic ?? 0),
    diastolic: Number(r.diastolic ?? 0),
    heartRate: Number(r.heart_rate ?? r.heartRate ?? 0),
    spo2: Number(r.spo2 ?? 0),
    temperatureC: Number(r.temperature_c ?? r.temperatureC ?? 0),
    respiratoryRate: Number(r.respiratory_rate ?? r.respiratoryRate ?? 0),
    recordedBy: String(r.recorded_by ?? r.recordedBy ?? ""),
    overdue: Boolean(r.overdue ?? false),
  };
}

export function toFrontendCarePlanItem(row: BackendCarePlanItem | Loose): CarePlanItem {
  const r = row as Loose;
  return {
    id: String(r.id ?? ""),
    patient: String(r.patient_id ?? r.patient ?? ""),
    sourceVisitNoteId:
      r.source_visit_note_id != null ? String(r.source_visit_note_id) : null,
    description: String(r.description ?? ""),
    dueAt: toIso(r.due_at) ?? String(r.due_at ?? ""),
    priority: (r.priority as CarePlanItem["priority"]) ?? "normal",
    completed: Boolean(r.completed),
    completedBy: r.completed_by != null ? String(r.completed_by) : null,
  };
}
