import * as admin from "./admin";
import * as appointment from "./appointment";
import * as audit from "./audit";
import * as auth from "./auth";
import * as billing from "./billing";
import * as medicalRecords from "./medical_records";
import * as patient from "./patient";
import * as widgetConfig from "./widget_config";

export { admin, appointment, audit, auth, billing, medicalRecords, patient, widgetConfig };

export const { departments, departmentStaff } = admin;
export const { appointments, doctorAvailability, doctorBlockedDays } = appointment;
export const { auditLog } = audit;
export const { users, sessions, permissionMatrix, passwordResets } = auth;
export const { invoices, invoiceLineItems, payments, insuranceClaims } = billing;
export const { visitNotes, prescriptions, attachments, vitals, carePlanItems } = medicalRecords;
export const { patients, patientAllergies, patientDedupFlags, patientAssignments } = patient;
export const { widgetDefinitions, userWidgetLayout } = widgetConfig;