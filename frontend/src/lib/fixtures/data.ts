/**
 * Shared typed fixture set (ticket #38).
 *
 * Ported from `promax-prototype/prototype/data.js` — that file is the source of
 * truth. The first twelve patients, ten doctors, four core departments and the
 * Budi Santoso timeline reproduce the prototype byte-for-byte so screenshots
 * stay reviewable. The rest is deterministic (fixed PRNG seed), never random,
 * so the set is stable across builds and machines.
 *
 * The clock is frozen at 9 Sep 2026, exactly as in the prototype.
 *
 * `scripts/sync-fixtures.ts` serialises the exported `fixtures` object to
 * `data.json`, which `backend/db/seed.py` reads. One dataset, typed, both sides.
 */

import type {
  Appointment,
  AuditLogEntry,
  CarePlanItem,
  Claim,
  Department,
  DepartmentStaff,
  Doctor,
  Invoice,
  InvoiceLine,
  Module,
  NavItem,
  Patient,
  PatientAllergy,
  Payment,
  PendingRecord,
  PermissionMatrixEntry,
  PermissionTable,
  Prescription,
  RevenuePoint,
  ClaimAgingBucket,
  Role,
  RoleDisplay,
  SessionProfile,
  Slot,
  TimelineEntry,
  User,
  VisitNote,
  Vitals,
  VitalsSeriesPoint,
  Widget,
  WidgetLayout,
} from "./types";

export const TODAY = "2026-09-09";

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

/** mulberry32 — tiny, fast, reproducible PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function pad(value: number, width: number): string {
  return value.toString().padStart(width, "0");
}

// ---------------------------------------------------------------------------
// Departments — the four core departments plus one unstaffed awkward state.
// ---------------------------------------------------------------------------

export const departments: Department[] = [
  { id: "GEN", name: "General", type: "general", beds: 48, occupied: 39, doctors: 4, color: "info", minCliniciansPerShift: 4, staffed: true, active: true },
  { id: "PED", name: "Pediatric", type: "pediatric", beds: 24, occupied: 15, doctors: 2, color: "primary", minCliniciansPerShift: 2, staffed: true, active: true },
  { id: "CAR", name: "Cardiology", type: "cardiology", beds: 20, occupied: 19, doctors: 2, color: "accent", minCliniciansPerShift: 2, staffed: true, active: true },
  { id: "EMG", name: "Emergency", type: "emergency", beds: 16, occupied: 16, doctors: 2, color: "danger", minCliniciansPerShift: 2, staffed: true, active: true },
];

/**
 * Awkward state: a department with zero clinicians on the roster. The admin
 * department screen renders "No staff assigned yet" and the booking form
 * disables it ("no doctors"). The locked PRD roster is the four above.
 */
export const unstaffedDepartment: Department = {
  id: "NEU",
  name: "Neurology",
  type: "neurology",
  beds: 12,
  occupied: 0,
  doctors: 0,
  color: "info",
  minCliniciansPerShift: 1,
  staffed: false,
  active: true,
};

export const allDepartments: Department[] = [...departments, unstaffedDepartment];

// ---------------------------------------------------------------------------
// Doctors (clinical roster). Every doctor is also a staff account (`userId`).
// ---------------------------------------------------------------------------

export const doctors: Doctor[] = [
  { id: "D01", userId: "U-102", name: "Dr. Sari Wibowo", email: "sari.w@sirkaya.health", dept: "CAR", spec: "Interventional Cardiology", onDuty: true, shift: "07:00–15:00" },
  { id: "D02", userId: "U-103", name: "Dr. Adi Nugroho", email: "adi.n@sirkaya.health", dept: "GEN", spec: "Internal Medicine", onDuty: true, shift: "07:00–15:00" },
  { id: "D03", userId: "U-106", name: "Dr. Lina Hartono", email: "lina.h@sirkaya.health", dept: "PED", spec: "General Pediatrics", onDuty: true, shift: "08:00–16:00" },
  { id: "D04", userId: "U-109", name: "Dr. Rendra Pratama", email: "rendra.p@sirkaya.health", dept: "EMG", spec: "Emergency Medicine", onDuty: true, shift: "23:00–07:00" },
  { id: "D05", userId: "U-110", name: "Dr. Maya Kusuma", email: "maya.k@sirkaya.health", dept: "GEN", spec: "Family Medicine", onDuty: true, shift: "15:00–23:00" },
  { id: "D06", userId: "U-111", name: "Dr. Bayu Setiawan", email: "bayu.s@sirkaya.health", dept: "CAR", spec: "Echocardiography", onDuty: false, shift: "—" },
  { id: "D07", userId: "U-112", name: "Dr. Nadia Puspita", email: "nadia.p@sirkaya.health", dept: "PED", spec: "Neonatology", onDuty: true, shift: "07:00–19:00" },
  { id: "D08", userId: "U-113", name: "Dr. Toni Halim", email: "toni.h@sirkaya.health", dept: "GEN", spec: "Gastroenterology", onDuty: false, shift: "—" },
  { id: "D09", userId: "U-114", name: "Dr. Ratna Dewi", email: "ratna.d@sirkaya.health", dept: "EMG", spec: "Trauma", onDuty: true, shift: "07:00–19:00" },
  { id: "D10", userId: "U-115", name: "Dr. Yusuf Maulana", email: "yusuf.m@sirkaya.health", dept: "GEN", spec: "Pulmonology", onDuty: false, shift: "—" },
];

// ---------------------------------------------------------------------------
// Staff accounts. Prototype U-101..U-108, doctor accounts U-109..U-115, plus
// the four canonical dev-login accounts the backend seed has always created.
// ---------------------------------------------------------------------------

export const users: User[] = [
  { id: "U-101", name: "Rahmat Hidayat", email: "rahmat.h@sirkaya.health", role: "Admin", dept: "—", status: "active", lastLogin: "2026-09-09 06:58", mfa: true },
  { id: "U-102", name: "Dr. Sari Wibowo", email: "sari.w@sirkaya.health", role: "Doctor", dept: "CAR", status: "active", lastLogin: "2026-09-09 07:12", mfa: true },
  { id: "U-103", name: "Dr. Adi Nugroho", email: "adi.n@sirkaya.health", role: "Doctor", dept: "GEN", status: "active", lastLogin: "2026-09-09 07:40", mfa: false },
  { id: "U-104", name: "Wati Lestari", email: "wati.l@sirkaya.health", role: "Nurse", dept: "CAR", status: "active", lastLogin: "2026-09-09 06:45", mfa: true },
  { id: "U-105", name: "Ika Permata", email: "ika.p@sirkaya.health", role: "Receptionist", dept: "GEN", status: "active", lastLogin: "2026-09-09 07:01", mfa: false },
  { id: "U-106", name: "Dr. Lina Hartono", email: "lina.h@sirkaya.health", role: "Doctor", dept: "PED", status: "active", lastLogin: "2026-09-08 16:22", mfa: true },
  { id: "U-107", name: "Bagus Saputra", email: "bagus.s@sirkaya.health", role: "Nurse", dept: "EMG", status: "invited", lastLogin: "—", mfa: false },
  { id: "U-108", name: "Sinta Maharani", email: "sinta.m@sirkaya.health", role: "Receptionist", dept: "PED", status: "inactive", lastLogin: "2026-06-14 09:30", mfa: false },
  { id: "U-109", name: "Dr. Rendra Pratama", email: "rendra.p@sirkaya.health", role: "Doctor", dept: "EMG", status: "active", lastLogin: "2026-09-09 07:05", mfa: true },
  { id: "U-110", name: "Dr. Maya Kusuma", email: "maya.k@sirkaya.health", role: "Doctor", dept: "GEN", status: "active", lastLogin: "2026-09-08 22:10", mfa: false },
  { id: "U-111", name: "Dr. Bayu Setiawan", email: "bayu.s@sirkaya.health", role: "Doctor", dept: "CAR", status: "active", lastLogin: "2026-09-06 14:00", mfa: true },
  { id: "U-112", name: "Dr. Nadia Puspita", email: "nadia.p@sirkaya.health", role: "Doctor", dept: "PED", status: "active", lastLogin: "2026-09-09 07:20", mfa: true },
  { id: "U-113", name: "Dr. Toni Halim", email: "toni.h@sirkaya.health", role: "Doctor", dept: "GEN", status: "active", lastLogin: "2026-09-04 11:32", mfa: false },
  { id: "U-114", name: "Dr. Ratna Dewi", email: "ratna.d@sirkaya.health", role: "Doctor", dept: "EMG", status: "active", lastLogin: "2026-09-09 07:15", mfa: true },
  { id: "U-115", name: "Dr. Yusuf Maulana", email: "yusuf.m@sirkaya.health", role: "Doctor", dept: "GEN", status: "active", lastLogin: "2026-09-03 09:48", mfa: false },
  { id: "U-201", name: "System Admin", email: "admin@hospital.test", role: "Admin", dept: "—", status: "active", lastLogin: "2026-09-09 06:00", mfa: false },
  { id: "U-202", name: "Dr. Alice Chen", email: "doctor@hospital.test", role: "Doctor", dept: "CAR", status: "active", lastLogin: "2026-09-09 06:05", mfa: false },
  { id: "U-203", name: "Nurse Bob Tan", email: "nurse@hospital.test", role: "Nurse", dept: "GEN", status: "active", lastLogin: "2026-09-09 06:10", mfa: false },
  { id: "U-204", name: "Receptionist Carol", email: "receptionist@hospital.test", role: "Receptionist", dept: "GEN", status: "active", lastLogin: "2026-09-09 06:15", mfa: false },
];

export const departmentStaff: DepartmentStaff[] = users
  .filter((u) => u.dept !== "—")
  .map((u, index) => ({ departmentId: u.dept, userId: u.id, assignedAt: `${addDays(TODAY, -90 - index)}T08:00:00.000Z` }));

// ---------------------------------------------------------------------------
// Patients — first twelve reproduce the prototype exactly.
// ---------------------------------------------------------------------------

const PROTOTYPE_PATIENTS: Patient[] = [
  { mrn: "P-001042", name: "Budi Santoso", dob: "1978-03-12", sex: "M", nid: "3174052103780004", dept: "CAR", doctor: "D01", acuity: "critical", status: "admitted", allergies: ["Penicillin"], phone: "+62 811 2043 118", lastVisit: "2026-09-09", balance: 4250000, insurer: "BPJS Kesehatan" },
  { mrn: "P-001108", name: "Siti Rahayu", dob: "1990-07-22", sex: "F", nid: "3174056207900002", dept: "GEN", doctor: "D02", acuity: "standard", status: "outpatient", allergies: [], phone: "+62 812 9911 402", lastVisit: "2026-09-08", balance: 0, insurer: "BPJS Kesehatan" },
  { mrn: "P-000997", name: "Agus Salim", dob: "1965-11-02", sex: "M", nid: "3174050211650001", dept: "GEN", doctor: "D05", acuity: "urgent", status: "admitted", allergies: ["Sulfa", "Latex"], phone: "+62 813 4420 771", lastVisit: "2026-09-09", balance: 1150000, insurer: "Mandiri Inhealth" },
  { mrn: "P-001155", name: "Dewi Lestari", dob: "2015-01-30", sex: "F", nid: "3174057001150003", dept: "PED", doctor: "D03", acuity: "standard", status: "outpatient", allergies: ["Peanut"], phone: "+62 815 7712 330", lastVisit: "2026-09-07", balance: 350000, insurer: "Self-pay" },
  { mrn: "P-001200", name: "Rina Wijaya", dob: "1988-09-14", sex: "F", nid: "3174055409880005", dept: "CAR", doctor: "D01", acuity: "routine", status: "outpatient", allergies: [], phone: "+62 816 2288 190", lastVisit: "2026-08-28", balance: 0, insurer: "Prudential" },
  { mrn: "P-001213", name: "Hendra Gunawan", dob: "1972-05-19", sex: "M", nid: "3174051905720008", dept: "EMG", doctor: "D04", acuity: "critical", status: "admitted", allergies: ["Aspirin"], phone: "+62 817 5540 226", lastVisit: "2026-09-09", balance: 8900000, insurer: "BPJS Kesehatan" },
  { mrn: "P-001231", name: "Putri Anggraini", dob: "1996-12-03", sex: "F", nid: "3174054312960007", dept: "GEN", doctor: "D02", acuity: "routine", status: "outpatient", allergies: [], phone: "+62 818 3301 774", lastVisit: "2026-09-02", balance: 275000, insurer: "Self-pay" },
  { mrn: "P-001244", name: "Joko Prasetyo", dob: "1959-02-08", sex: "M", nid: "3174050802590006", dept: "CAR", doctor: "D06", acuity: "urgent", status: "outpatient", allergies: ["Iodine"], phone: "+62 819 6612 085", lastVisit: "2026-09-06", balance: 2100000, insurer: "Mandiri Inhealth" },
  { mrn: "P-001255", name: "Ayu Kartika", dob: "2019-06-25", sex: "F", nid: "3174056506190009", dept: "PED", doctor: "D07", acuity: "standard", status: "admitted", allergies: [], phone: "+62 811 7788 341", lastVisit: "2026-09-09", balance: 640000, insurer: "BPJS Kesehatan" },
  { mrn: "P-001266", name: "Fajar Nugraha", dob: "1984-10-11", sex: "M", nid: "3174051110840012", dept: "GEN", doctor: "D08", acuity: "routine", status: "discharged", allergies: [], phone: "+62 812 2119 668", lastVisit: "2026-08-30", balance: 0, insurer: "Prudential" },
  { mrn: "P-001271", name: "Lestari Ningsih", dob: "1993-04-17", sex: "F", nid: "3174055704930011", dept: "GEN", doctor: "D02", acuity: "standard", status: "outpatient", allergies: ["Codeine"], phone: "+62 813 8890 254", lastVisit: "2026-09-05", balance: 480000, insurer: "BPJS Kesehatan" },
  { mrn: "P-001288", name: "Rizky Ramadhan", dob: "2001-08-09", sex: "M", nid: "3174050908010010", dept: "EMG", doctor: "D09", acuity: "urgent", status: "admitted", allergies: [], phone: "+62 815 4402 913", lastVisit: "2026-09-09", balance: 3300000, insurer: "Self-pay" },
];

const FIRST_NAMES = [
  "Ahmad", "Bambang", "Citra", "Dian", "Eko", "Fitri", "Gunawan", "Hesti", "Irfan", "Jihan",
  "Kartika", "Lukman", "Mega", "Nanda", "Oki", "Puspita", "Qori", "Rudi", "Sri", "Taufik",
  "Umi", "Vina", "Wahyu", "Yanti", "Zainal", "Anisa", "Bagas", "Cindy", "Dimas", "Endah",
];

const LAST_NAMES = [
  "Pratama", "Saputra", "Hidayat", "Nugroho", "Wibowo", "Setiawan", "Kusuma", "Halim", "Dewi", "Maulana",
  "Lestari", "Permata", "Anggraini", "Prasetyo", "Kartika", "Nugraha", "Ramadhan", "Santoso", "Rahayu", "Salim",
  "Hartono", "Puspita", "Wijaya", "Gunawan", "Ningsih", "Firmansyah", "Susanti", "Rahmawati", "Fauzi", "Siregar",
];

const EXTRA_ACUITY: Patient["acuity"][] = [
  "routine", "standard", "standard", "urgent", "routine", "standard", "critical", "routine", "standard", "urgent",
];

const EXTRA_STATUS: Patient["status"][] = [
  "outpatient", "outpatient", "admitted", "outpatient", "discharged", "outpatient", "admitted", "outpatient",
];

const EXTRA_INSURER = ["BPJS Kesehatan", "Self-pay", "Mandiri Inhealth", "Prudential"];
const EXTRA_ALLERGY = ["Penicillin", "Sulfa", "Latex", "Peanut", "Aspirin", "Iodine", "Codeine", "Egg", "Shellfish"];
const EXTRA_DEPT_CYCLE = ["GEN", "GEN", "PED", "CAR", "EMG", "GEN", "PED", "CAR"];

function doctorsInDept(dept: string): Doctor[] {
  return doctors.filter((d) => d.dept === dept);
}

function makeExtraPatients(count: number): Patient[] {
  const rand = mulberry32(0x38_2026);
  const out: Patient[] = [];
  for (let i = 0; i < count; i += 1) {
    const first = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)];
    const dept = EXTRA_DEPT_CYCLE[i % EXTRA_DEPT_CYCLE.length];
    const roster = doctorsInDept(dept);
    const doctor = roster[Math.floor(rand() * roster.length)];
    const year = 1948 + Math.floor(rand() * 72);
    const month = 1 + Math.floor(rand() * 12);
    const day = 1 + Math.floor(rand() * 28);
    const sex: Patient["sex"] = rand() > 0.5 ? "F" : "M";
    const acuity = EXTRA_ACUITY[i % EXTRA_ACUITY.length];
    const status = EXTRA_STATUS[i % EXTRA_STATUS.length];
    const insurer = EXTRA_INSURER[i % EXTRA_INSURER.length];
    const mrn = `P-${pad(2000 + i, 6)}`;
    const nid = `3174${pad(Math.floor(rand() * 1_000_000_000_000), 12)}`;
    const allergies = i % 7 === 3 ? [EXTRA_ALLERGY[i % EXTRA_ALLERGY.length]] : [];
    const balance =
      status === "discharged" ? 0 : Math.round((rand() * 4_000_000) / 50_000) * 50_000;
    out.push({
      mrn,
      name: `${first} ${last}`,
      dob: `${year}-${pad(month, 2)}-${pad(day, 2)}`,
      sex,
      nid,
      dept,
      doctor: doctor.id,
      acuity,
      status,
      allergies,
      phone: `+62 8${pad(Math.floor(rand() * 100_000_000), 8)}`,
      lastVisit: addDays(TODAY, -(i % 30)),
      balance,
      insurer,
    });
  }
  return out;
}

export const patients: Patient[] = [...PROTOTYPE_PATIENTS, ...makeExtraPatients(88)];

// ---------------------------------------------------------------------------
// Allergies (severity comes from the DB schema; the prototype only listed the
// substance). Awkward state: penicillin allergy on the critical patient.
// ---------------------------------------------------------------------------

const ALLERGY_SEVERITY: Record<string, PatientAllergy["severity"]> = {
  Penicillin: "severe",
  Sulfa: "moderate",
  Latex: "mild",
  Peanut: "severe",
  Aspirin: "severe",
  Iodine: "moderate",
  Codeine: "moderate",
  Egg: "moderate",
  Shellfish: "severe",
};

export const patientAllergies: PatientAllergy[] = patients.flatMap((p, index) =>
  p.allergies.map((substance) => ({
    patient: p.mrn,
    substance,
    severity: ALLERGY_SEVERITY[substance] ?? "moderate",
    notedBy: index % 2 === 0 ? "U-104" : "U-203",
    notedAt: `${addDays(TODAY, -(index % 20) - 1)}T09:00:00.000Z`,
  })),
);

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export const slots: Slot[] = [
  { time: "08:00", status: "booked", patient: "P-001042", reason: "Post-PCI follow-up" },
  { time: "08:30", status: "booked", patient: "P-001200", reason: "Echo review" },
  { time: "09:00", status: "open" },
  { time: "09:30", status: "booked", patient: "P-001244", reason: "Chest pain workup" },
  { time: "10:00", status: "blocked", reason: "Cath lab block" },
  { time: "10:30", status: "blocked", reason: "Cath lab block" },
  { time: "11:00", status: "open" },
  { time: "11:30", status: "open" },
  { time: "12:00", status: "blocked", reason: "Lunch" },
  { time: "12:30", status: "open" },
  { time: "13:00", status: "booked", patient: "P-001108", reason: "Hypertension review" },
  { time: "13:30", status: "open" },
  { time: "14:00", status: "held", reason: "Held for ER referral" },
  { time: "14:30", status: "open" },
];

export const appointments: Appointment[] = [
  { id: "A-8801", time: "08:00", patient: "P-001042", doctor: "D01", dept: "CAR", status: "checked_in", reason: "Post-PCI follow-up", wait: 4, date: TODAY, checkedInAt: `${TODAY}T08:04:00.000Z` },
  { id: "A-8802", time: "08:30", patient: "P-001200", doctor: "D01", dept: "CAR", status: "completed", reason: "Echo review", wait: 0, date: TODAY, checkedInAt: `${TODAY}T08:25:00.000Z` },
  { id: "A-8803", time: "09:00", patient: "P-001108", doctor: "D02", dept: "GEN", status: "booked", reason: "Hypertension review", wait: 0, date: TODAY, checkedInAt: null },
  { id: "A-8804", time: "09:15", patient: "P-001155", doctor: "D03", dept: "PED", status: "checked_in", reason: "Asthma review", wait: 12, date: TODAY, checkedInAt: `${TODAY}T09:27:00.000Z` },
  { id: "A-8805", time: "09:30", patient: "P-001244", doctor: "D06", dept: "CAR", status: "no_show", reason: "Chest pain workup", wait: 0, date: TODAY, checkedInAt: null },
  { id: "A-8806", time: "10:00", patient: "P-000997", doctor: "D05", dept: "GEN", status: "booked", reason: "Wound dressing", wait: 0, date: TODAY, checkedInAt: null },
  { id: "A-8807", time: "10:30", patient: "P-001231", doctor: "D02", dept: "GEN", status: "cancelled", reason: "Lab follow-up", wait: 0, date: TODAY, checkedInAt: null },
  { id: "A-8808", time: "11:00", patient: "P-001255", doctor: "D07", dept: "PED", status: "checked_in", reason: "Fever, 3 days", wait: 21, date: TODAY, checkedInAt: `${TODAY}T11:21:00.000Z` },
  { id: "A-8809", time: "11:30", patient: "P-001271", doctor: "D02", dept: "GEN", status: "booked", reason: "Migraine", wait: 0, date: TODAY, checkedInAt: null },
  { id: "A-8810", time: "13:00", patient: "P-001288", doctor: "D09", dept: "EMG", status: "booked", reason: "Suture removal", wait: 0, date: TODAY, checkedInAt: null },
];

// ---------------------------------------------------------------------------
// Cross-department timeline (Budi Santoso, P-001042) — CAR + GEN + EMG.
// ---------------------------------------------------------------------------

export const timeline: TimelineEntry[] = [
  { at: "2026-09-09 07:42", dept: "CAR", kind: "vitals", by: "Nurse Wati Lestari", title: "Vitals recorded", body: "BP 148/94 · HR 88 · SpO₂ 96% · Temp 36.8°C · RR 18" },
  { at: "2026-09-08 16:10", dept: "CAR", kind: "prescription", by: "Dr. Sari Wibowo", title: "Prescription issued", body: "Bisoprolol 5 mg — 1×/day, 30 days · Atorvastatin 20 mg — 1×/night, 30 days" },
  { at: "2026-09-08 15:55", dept: "CAR", kind: "note", by: "Dr. Sari Wibowo", title: "Visit note — Post-PCI review", body: "Stable angina, NYHA II. Stent patent on angiography. Continue dual antiplatelet therapy. Review in 4 weeks.", dx: "I25.10 — Atherosclerotic heart disease" },
  { at: "2026-09-04 11:20", dept: "GEN", kind: "lab", by: "Dr. Adi Nugroho", title: "Lab result — Lipid panel", body: "LDL 138 mg/dL (high) · HDL 41 · TG 190 · Total 214", flag: "abnormal" },
  { at: "2026-08-30 09:05", dept: "GEN", kind: "note", by: "Dr. Adi Nugroho", title: "Visit note — Routine review", body: "Reports mild exertional dyspnoea. Referred to Cardiology for stress testing.", dx: "R06.00 — Dyspnoea, unspecified" },
  { at: "2026-08-21 14:30", dept: "EMG", kind: "admission", by: "Dr. Rendra Pratama", title: "Emergency admission", body: "Presented with chest tightness 40 min. Troponin negative ×2. Discharged same day with cardiology referral." },
  { at: "2026-07-19 10:00", dept: "CAR", kind: "procedure", by: "Dr. Sari Wibowo", title: "Procedure — PCI with DES", body: "Single-vessel PCI to LAD, drug-eluting stent 3.0×18 mm. No complications." },
];

// ---------------------------------------------------------------------------
// Vitals — compact chart series (prototype) + rich 30-day readings.
// ---------------------------------------------------------------------------

export const vitals: VitalsSeriesPoint[] = [
  { at: "09-03", sys: 156, dia: 98, hr: 92 },
  { at: "09-04", sys: 152, dia: 96, hr: 90 },
  { at: "09-05", sys: 150, dia: 95, hr: 89 },
  { at: "09-06", sys: 147, dia: 93, hr: 86 },
  { at: "09-07", sys: 145, dia: 92, hr: 84 },
  { at: "09-08", sys: 149, dia: 94, hr: 88 },
  { at: "09-09", sys: 148, dia: 94, hr: 88 },
];

const VITALS_BASE: Record<Patient["acuity"], [number, number, number]> = {
  critical: [150, 95, 90],
  urgent: [140, 88, 84],
  standard: [125, 80, 76],
  routine: [118, 76, 72],
};

function makeVitalReadings(patient: Patient): Vitals[] {
  const rand = mulberry32(hashSeed(patient.mrn));
  const [baseSys, baseDia, baseHr] = VITALS_BASE[patient.acuity];
  const overdue = patient.mrn === "P-001213";
  const end = overdue ? addDays(TODAY, -2) : TODAY;
  const readings: Vitals[] = [];
  for (let i = 0; i < 30; i += 1) {
    const day = addDays(end, -i);
    const jitter = Math.floor(rand() * 7) - 3;
    readings.push({
      id: `V-${patient.mrn}-${pad(30 - i, 2)}`,
      patient: patient.mrn,
      recordedAt: `${day}T07:${pad(10 + Math.floor(rand() * 45), 2)}:00.000Z`,
      systolic: baseSys + jitter,
      diastolic: baseDia + Math.floor(jitter / 2),
      heartRate: baseHr + Math.floor(rand() * 9) - 4,
      spo2: 94 + Math.floor(rand() * 5),
      temperatureC: Math.round((36.3 + rand() * 1.1) * 10) / 10,
      respiratoryRate: 14 + Math.floor(rand() * 7),
      recordedBy: patient.dept === "EMG" ? "U-107" : "U-104",
      overdue: overdue && i === 0,
    });
  }
  return readings;
}

export const vitalReadings: Vitals[] = patients.flatMap(makeVitalReadings);

// ---------------------------------------------------------------------------
// Visit notes + prescriptions
// ---------------------------------------------------------------------------

const prescriptions: Prescription[] = [
  { id: "PR-9001", visitNoteId: "VN-9001", medication: "Bisoprolol 5 mg", dosage: "5 mg", frequency: "1×/day", durationDays: 30 },
  { id: "PR-9002", visitNoteId: "VN-9001", medication: "Atorvastatin 20 mg", dosage: "20 mg", frequency: "1×/night", durationDays: 30 },
  { id: "PR-9003", visitNoteId: "VN-9002", medication: "Amlodipine 10 mg", dosage: "10 mg", frequency: "1×/day", durationDays: 30 },
  { id: "PR-9004", visitNoteId: "VN-9003", medication: "Paracetamol 500 mg", dosage: "500 mg", frequency: "3×/day", durationDays: 5 },
];

export const visitNotes: VisitNote[] = [
  { id: "VN-9001", appointmentId: "A-8801", patient: "P-001042", doctor: "D01", dept: "CAR", chiefComplaint: "Post-PCI follow-up", diagnosis: "I25.10 — Atherosclerotic heart disease", clinicalNotes: "Stable angina, NYHA II. Stent patent on angiography. Continue dual antiplatelet therapy.", status: "signed", signedAt: "2026-09-08T16:00:00.000Z", createdAt: "2026-09-08T15:55:00.000Z", prescriptions: prescriptions.filter((p) => p.visitNoteId === "VN-9001") },
  { id: "VN-9002", appointmentId: null, patient: "P-001042", doctor: "D02", dept: "GEN", chiefComplaint: "Routine review", diagnosis: "R06.00 — Dyspnoea, unspecified", clinicalNotes: "Mild exertional dyspnoea. Referred to Cardiology for stress testing.", status: "signed", signedAt: "2026-08-30T09:30:00.000Z", createdAt: "2026-08-30T09:05:00.000Z", prescriptions: prescriptions.filter((p) => p.visitNoteId === "VN-9002") },
  { id: "VN-9003", appointmentId: "A-8806", patient: "P-000997", doctor: "D05", dept: "GEN", chiefComplaint: "Wound dressing", diagnosis: "S01.501 — Open wound of forearm", clinicalNotes: "Clean wound, no signs of infection. Dressing changed.", status: "submitted", signedAt: null, createdAt: "2026-09-08T15:30:00.000Z", prescriptions: prescriptions.filter((p) => p.visitNoteId === "VN-9003") },
  { id: "VN-9004", appointmentId: "A-8804", patient: "P-001155", doctor: "D03", dept: "PED", chiefComplaint: "Asthma review", diagnosis: "J45.909 — Unspecified asthma", clinicalNotes: "Peanut allergy noted. Inhaler technique reviewed with parent.", status: "draft", signedAt: null, createdAt: "2026-09-09T09:15:00.000Z", prescriptions: [] },
  { id: "VN-9005", appointmentId: "A-8801", patient: "P-001042", doctor: "D01", dept: "CAR", chiefComplaint: "Post-PCI follow-up", diagnosis: "I25.10 — Atherosclerotic heart disease", clinicalNotes: "Vitals stable. Awaiting discharge planning.", status: "draft", signedAt: null, createdAt: "2026-09-09T08:00:00.000Z", prescriptions: [] },
  { id: "VN-9006", appointmentId: "A-8810", patient: "P-001288", doctor: "D09", dept: "EMG", chiefComplaint: "Suture removal", diagnosis: "Z48.02 — Encounter for removal of sutures", clinicalNotes: "Wound healed. Suture removal complete.", status: "draft", signedAt: null, createdAt: "2026-09-08T22:10:00.000Z", prescriptions: [] },
  { id: "VN-9007", appointmentId: "A-8809", patient: "P-001271", doctor: "D02", dept: "GEN", chiefComplaint: "Migraine", diagnosis: "G43.909 — Migraine, unspecified", clinicalNotes: "Triggers reviewed. Advised hydration and sleep hygiene.", status: "submitted", signedAt: null, createdAt: "2026-09-05T10:00:00.000Z", prescriptions: [] },
];

export const carePlanItems: CarePlanItem[] = [
  { id: "CP-001", patient: "P-001042", sourceVisitNoteId: "VN-9001", description: "Record vitals every 4 hours", dueAt: `${TODAY}T12:00:00.000Z`, priority: "high", completed: false, completedBy: null },
  { id: "CP-002", patient: "P-001042", sourceVisitNoteId: "VN-9001", description: "Cardiac rehab education", dueAt: `${TODAY}T16:00:00.000Z`, priority: "normal", completed: false, completedBy: null },
  { id: "CP-003", patient: "P-000997", sourceVisitNoteId: "VN-9003", description: "Wound dressing change", dueAt: `${addDays(TODAY, 1)}T09:00:00.000Z`, priority: "normal", completed: true, completedBy: "U-203" },
  { id: "CP-004", patient: "P-001213", sourceVisitNoteId: null, description: "Continuous SpO₂ monitoring", dueAt: `${TODAY}T11:00:00.000Z`, priority: "high", completed: false, completedBy: null },
];

export const pendingRecords: PendingRecord[] = [
  { id: "R-4412", patient: "P-001042", dept: "CAR", doctor: "D01", visit: "2026-09-09 08:00", age: "2h 14m", state: "draft" },
  { id: "R-4411", patient: "P-001155", dept: "PED", doctor: "D03", visit: "2026-09-09 09:15", age: "1h 02m", state: "draft" },
  { id: "R-4409", patient: "P-000997", dept: "GEN", doctor: "D05", visit: "2026-09-08 15:30", age: "18h", state: "submitted" },
  { id: "R-4405", patient: "P-001288", dept: "EMG", doctor: "D09", visit: "2026-09-08 22:10", age: "11h", state: "draft" },
  { id: "R-4398", patient: "P-001271", dept: "GEN", doctor: "D02", visit: "2026-09-05 10:00", age: "4d", state: "submitted" },
];

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export const invoiceLines: InvoiceLine[] = [
  { code: "CONS-CAR", desc: "Cardiology consultation — Dr. Sari Wibowo", qty: 1, unit: 450000, dept: "CAR" },
  { code: "PROC-ECHO", desc: "Echocardiography, transthoracic", qty: 1, unit: 1850000, dept: "CAR" },
  { code: "LAB-TROP", desc: "Troponin I, high sensitivity", qty: 2, unit: 320000, dept: "GEN" },
  { code: "LAB-LIPID", desc: "Lipid panel, fasting", qty: 1, unit: 275000, dept: "GEN" },
  { code: "ROOM-CAR-2", desc: "Ward bed, Cardiology class 2 — 3 nights", qty: 3, unit: 1750000, dept: "CAR" },
  { code: "PHARM-BISO", desc: "Bisoprolol 5 mg tab × 30", qty: 1, unit: 185000, dept: "CAR" },
  { code: "PHARM-ATOR", desc: "Atorvastatin 20 mg tab × 30", qty: 1, unit: 240000, dept: "CAR" },
];

function simpleLines(total: number, dept: string): InvoiceLine[] {
  return [
    { code: `CONS-${dept}`, desc: `${dept} consultation`, qty: 1, unit: Math.round(total * 0.6), dept },
    { code: `LAB-${dept}`, desc: "Laboratory panel", qty: 1, unit: Math.round(total * 0.4), dept },
  ];
}

export const invoices: Invoice[] = [
  { id: "INV-2026-0918", patient: "P-001042", date: "2026-09-09", total: 12450000, paid: 8200000, status: "partially_paid", insurer: "BPJS Kesehatan", claim: "submitted", lines: invoiceLines },
  { id: "INV-2026-0917", patient: "P-001213", date: "2026-09-09", total: 8900000, paid: 0, status: "unpaid", insurer: "BPJS Kesehatan", claim: "draft", lines: simpleLines(8900000, "EMG") },
  { id: "INV-2026-0916", patient: "P-001288", date: "2026-09-09", total: 3300000, paid: 0, status: "unpaid", insurer: "Self-pay", claim: "none", lines: simpleLines(3300000, "EMG") },
  { id: "INV-2026-0915", patient: "P-001255", date: "2026-09-09", total: 640000, paid: 640000, status: "paid", insurer: "BPJS Kesehatan", claim: "approved", lines: simpleLines(640000, "PED") },
  { id: "INV-2026-0914", patient: "P-000997", date: "2026-09-08", total: 1150000, paid: 0, status: "unpaid", insurer: "Mandiri Inhealth", claim: "denied", lines: simpleLines(1150000, "GEN") },
  { id: "INV-2026-0913", patient: "P-001244", date: "2026-09-06", total: 2100000, paid: 500000, status: "partially_paid", insurer: "Mandiri Inhealth", claim: "submitted", lines: simpleLines(2100000, "CAR") },
  { id: "INV-2026-0912", patient: "P-001271", date: "2026-09-05", total: 480000, paid: 0, status: "unpaid", insurer: "BPJS Kesehatan", claim: "draft", lines: simpleLines(480000, "GEN") },
  { id: "INV-2026-0911", patient: "P-001231", date: "2026-09-02", total: 275000, paid: 275000, status: "paid", insurer: "Self-pay", claim: "none", lines: simpleLines(275000, "GEN") },
  { id: "INV-2026-0910", patient: "P-001108", date: "2026-09-01", total: 890000, paid: 890000, status: "paid", insurer: "BPJS Kesehatan", claim: "approved", lines: simpleLines(890000, "GEN") },
];

export const claims: Claim[] = invoices
  .filter((inv) => inv.claim !== "none")
  .map((inv, index) => {
    const denied = inv.claim === "denied";
    return {
      id: `CLM-${pad(1000 + index, 4)}`,
      invoiceId: inv.id,
      payerName: inv.insurer,
      claimNumber: `KLAIM/${2026}/${pad(400 + index, 4)}`,
      status: inv.claim,
      denialReason: denied ? "Service not covered under active benefit tier (non-emergency admission)." : null,
      appealDeadline: denied ? addDays(TODAY, 14) : null,
      submittedAt: inv.claim === "draft" || inv.claim === "none" ? null : `${inv.date}T10:00:00.000Z`,
    };
  });

export const payments: Payment[] = invoices
  .filter((inv) => inv.paid > 0)
  .map((inv, index) => ({
    id: `PAY-${pad(2000 + index, 4)}`,
    invoiceId: inv.id,
    amount: inv.paid,
    method: inv.insurer === "Self-pay" ? "cash" : "insurance",
    reference: `RCPT/${inv.id}`,
    paidAt: `${inv.date}T14:30:00.000Z`,
  }));

// ---------------------------------------------------------------------------
// Widgets + per-user layouts. Locked widgets (admin override) are visible.
// ---------------------------------------------------------------------------

export const widgets: Widget[] = [
  { key: "todays-appointments", name: "Today's Appointments", desc: "Live day queue with status and wait time.", size: "lg", roles: ["Admin", "Receptionist", "Doctor"], enabled: true, locked: true, icon: "calendar-clock" },
  { key: "recent-patients", name: "Recent Patients", desc: "Last 10 patients you touched.", size: "md", roles: ["Admin", "Doctor", "Nurse"], enabled: true, locked: false, icon: "users" },
  { key: "department-occupancy", name: "Department Occupancy", desc: "Bed utilisation per department.", size: "md", roles: ["Admin"], enabled: true, locked: false, icon: "bed-double" },
  { key: "revenue-month", name: "Revenue This Month", desc: "Billed vs collected, running total.", size: "md", roles: ["Admin"], enabled: true, locked: false, icon: "trending-up" },
  { key: "pending-records", name: "Pending Records", desc: "Visit notes not yet signed off.", size: "md", roles: ["Admin", "Doctor"], enabled: true, locked: true, icon: "file-clock" },
  { key: "staff-on-duty", name: "Staff On Duty", desc: "Who is on shift, by department.", size: "sm", roles: ["Admin"], enabled: true, locked: false, icon: "badge-check" },
  { key: "registration-queue", name: "Registration Queue", desc: "Walk-ins waiting to be registered.", size: "lg", roles: ["Receptionist"], enabled: true, locked: false, icon: "clipboard-list" },
  { key: "todays-schedule", name: "Today's Schedule", desc: "Your own clinic day, slot by slot.", size: "lg", roles: ["Doctor"], enabled: true, locked: true, icon: "calendar-days" },
  { key: "vitals-queue", name: "Vitals Queue", desc: "Patients with vitals pending intake.", size: "md", roles: ["Doctor", "Nurse"], enabled: true, locked: false, icon: "activity" },
  { key: "assigned-patients", name: "Assigned Patients", desc: "Your ward assignment for this shift.", size: "lg", roles: ["Nurse"], enabled: true, locked: false, icon: "user-check" },
  { key: "vitals-entry", name: "Vitals Entry", desc: "Fast inline vitals capture.", size: "md", roles: ["Nurse"], enabled: true, locked: false, icon: "stethoscope" },
  { key: "care-plan", name: "Care Plan", desc: "Active care plan items due this shift.", size: "md", roles: ["Nurse"], enabled: false, locked: false, icon: "list-checks" },
];

/**
 * Awkward state: the doctor tried to hide the locked `pending-records` widget
 * (enabled: false) — the admin lock still wins and the UI shows it locked.
 */
export const widgetLayouts: WidgetLayout[] = [
  { userId: "U-102", widgetKey: "todays-schedule", positionOrder: 0, enabled: true, size: "lg" },
  { userId: "U-102", widgetKey: "pending-records", positionOrder: 1, enabled: false, size: "md" },
  { userId: "U-102", widgetKey: "recent-patients", positionOrder: 2, enabled: true, size: "md" },
  { userId: "U-102", widgetKey: "vitals-queue", positionOrder: 3, enabled: true, size: "md" },
  { userId: "U-101", widgetKey: "todays-appointments", positionOrder: 0, enabled: false, size: "lg" },
  { userId: "U-101", widgetKey: "department-occupancy", positionOrder: 1, enabled: true, size: "md" },
  { userId: "U-101", widgetKey: "revenue-month", positionOrder: 2, enabled: true, size: "md" },
  { userId: "U-101", widgetKey: "staff-on-duty", positionOrder: 3, enabled: true, size: "sm" },
  { userId: "U-104", widgetKey: "assigned-patients", positionOrder: 0, enabled: true, size: "lg" },
  { userId: "U-104", widgetKey: "vitals-entry", positionOrder: 1, enabled: true, size: "md" },
  { userId: "U-104", widgetKey: "vitals-queue", positionOrder: 2, enabled: true, size: "md" },
  { userId: "U-104", widgetKey: "care-plan", positionOrder: 3, enabled: false, size: "md" },
  { userId: "U-105", widgetKey: "todays-appointments", positionOrder: 0, enabled: true, size: "lg" },
  { userId: "U-105", widgetKey: "registration-queue", positionOrder: 1, enabled: true, size: "lg" },
];

// ---------------------------------------------------------------------------
// Dashboards / reports
// ---------------------------------------------------------------------------

export const revenue: RevenuePoint[] = [
  { d: "01", billed: 148, collected: 121 }, { d: "02", billed: 162, collected: 130 },
  { d: "03", billed: 139, collected: 118 }, { d: "04", billed: 171, collected: 142 },
  { d: "05", billed: 158, collected: 133 }, { d: "06", billed: 96, collected: 74 },
  { d: "07", billed: 88, collected: 69 }, { d: "08", billed: 176, collected: 148 },
  { d: "09", billed: 183, collected: 121 },
];

export const visitsTrend: number[] = [42, 48, 45, 51, 47, 29, 24, 55, 61];
export const admitTrend: number[] = [11, 13, 10, 14, 12, 7, 6, 15, 17];

export const claimAging: ClaimAgingBucket[] = [
  { bucket: "0–15d", count: 42, value: 186 },
  { bucket: "16–30d", count: 27, value: 121 },
  { bucket: "31–60d", count: 14, value: 78 },
  { bucket: "60d+", count: 6, value: 41 },
];

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/** Prototype display table: role -> module -> action letters (`vced`). */
export const permissionTable: PermissionTable = {
  Admin: { Patients: "vced", Appointments: "vced", Records: "vced", Billing: "vced", Admin: "vced", Reports: "v" },
  Doctor: { Patients: "vce", Appointments: "vce", Records: "vce", Billing: "", Admin: "", Reports: "v" },
  Nurse: { Patients: "v", Appointments: "v", Records: "vc", Billing: "", Admin: "", Reports: "" },
  Receptionist: { Patients: "vce", Appointments: "vced", Records: "v", Billing: "vc", Admin: "", Reports: "" },
};

export const permissionModules = ["Patients", "Appointments", "Records", "Billing", "Admin", "Reports"] as const;
export const permissionActions = ["view", "create", "edit", "delete"] as const;

const RBAC_ROLES: Role[] = ["admin", "doctor", "nurse", "receptionist"];
const RBAC_MODULES: Module[] = ["patients", "appointments", "records", "billing", "admin", "widget-config", "audit"];
const RBAC_ALLOWED: Record<Role, Module[]> = {
  admin: RBAC_MODULES,
  doctor: ["patients", "appointments", "records"],
  nurse: ["patients", "records"],
  receptionist: ["patients", "appointments", "billing"],
};

/** 4 roles × 7 modules = 28 explicit allow/deny rows (matches backend seed). */
export const permissionMatrix: PermissionMatrixEntry[] = RBAC_ROLES.flatMap((role) =>
  RBAC_MODULES.map((module) => {
    const allowed = RBAC_ALLOWED[role].includes(module);
    return {
      role,
      module,
      allowed,
      canView: allowed,
      canCreate: role === "admin" && allowed,
      canEdit: role === "admin" && allowed,
      canDelete: role === "admin" && allowed,
    };
  }),
);

export const rbacRoles = RBAC_ROLES;
export const rbacModules = RBAC_MODULES;

// ---------------------------------------------------------------------------
// Navigation / session profiles
// ---------------------------------------------------------------------------

export const nav: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: "layout-dashboard", href: null, module: null },
  { key: "patients", label: "Patients", icon: "users", href: "/patients", module: "patients" },
  { key: "appointments", label: "Appointments", icon: "calendar-days", href: "/appointments", module: "appointments" },
  { key: "records", label: "Records", icon: "file-text", href: "/records", module: "records" },
  { key: "billing", label: "Billing", icon: "receipt-text", href: "/billing", module: "billing" },
  {
    key: "admin", label: "Admin", icon: "shield-check", href: null, module: "admin",
    children: [
      { key: "users", label: "Users", icon: "user-cog", href: "/admin/users", module: "admin" },
      { key: "departments", label: "Departments", icon: "building-2", href: "/admin/departments", module: "admin" },
      { key: "widgets", label: "Widget Library", icon: "layout-grid", href: "/admin/widgets", module: "admin" },
      { key: "permissions", label: "Permissions", icon: "key-round", href: "/admin/permissions", module: "admin" },
    ],
  },
  { key: "reports", label: "Reports", icon: "bar-chart-3", href: null, module: null },
];

export const dashboardFor: Record<RoleDisplay, string> = {
  Admin: "/dashboard",
  Receptionist: "/dashboard",
  Doctor: "/dashboard",
  Nurse: "/dashboard",
};

export const sessions: Record<RoleDisplay, SessionProfile> = {
  Admin: { name: "Rahmat Hidayat", role: "Admin", dept: "—", initials: "RH" },
  Doctor: { name: "Dr. Sari Wibowo", role: "Doctor", dept: "Cardiology", initials: "SW" },
  Nurse: { name: "Wati Lestari", role: "Nurse", dept: "Cardiology", initials: "WL" },
  Receptionist: { name: "Ika Permata", role: "Receptionist", dept: "General", initials: "IP" },
};

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export const auditLog: AuditLogEntry[] = [
  { id: "AL-0001", actorUserId: 1, action: "login.success", entityType: "user", entityId: "1", createdAt: `${TODAY}T06:58:00.000Z` },
  { id: "AL-0002", actorUserId: 1, action: "permission.update", entityType: "permission_matrix", entityId: "receptionist/billing", createdAt: `${TODAY}T07:02:00.000Z` },
  { id: "AL-0003", actorUserId: 2, action: "record.sign", entityType: "visit_note", entityId: "VN-9001", createdAt: `${TODAY}T08:10:00.000Z` },
  { id: "AL-0004", actorUserId: 5, action: "appointment.check_in", entityType: "appointment", entityId: "A-8801", createdAt: `${TODAY}T08:04:00.000Z` },
];

// ---------------------------------------------------------------------------
// Lookups & formatters (parity with the prototype DB helpers)
// ---------------------------------------------------------------------------

export const byMrn = (mrn: string): Patient | { name: string; mrn: string } =>
  patients.find((p) => p.mrn === mrn) ?? { name: "Unknown", mrn };

export const byDoctor = (id: string): Doctor | { name: string; dept: string } =>
  doctors.find((d) => d.id === id) ?? { name: "Unassigned", dept: "—" };

export const deptName = (id: string): string =>
  allDepartments.find((d) => d.id === id)?.name ?? id;

export function age(dob: string): number {
  const [y, m, d] = dob.split("-").map(Number);
  const [ty, tm, td] = TODAY.split("-").map(Number);
  let a = ty - y;
  if (tm < m || (tm === m && td < d)) a -= 1;
  return a;
}

/** Indonesian grouping, no decimals: Rp 1.750.000 */
export const rp = (n: number): string => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

/** Compact millions: Rp 4,3 jt */
export const jt = (n: number): string =>
  `Rp ${(n / 1_000_000).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} jt`;

export const pct = (a: number, b: number): number => (b === 0 ? 0 : Math.round((a / b) * 100));

// ---------------------------------------------------------------------------
// The object serialised to data.json for the backend seed.
// ---------------------------------------------------------------------------

export const fixtures = {
  TODAY,
  today: TODAY,
  departments,
  allDepartments,
  unstaffedDepartment,
  doctors,
  users,
  departmentStaff,
  patients,
  patientAllergies,
  slots,
  appointments,
  timeline,
  vitals,
  vitalReadings,
  visitNotes,
  prescriptions,
  carePlanItems,
  pendingRecords,
  invoices,
  invoiceLines,
  claims,
  payments,
  widgets,
  widgetLayouts,
  revenue,
  visitsTrend,
  admitTrend,
  claimAging,
  permissionMatrix,
  auditLog,
} as const;

export type Fixtures = typeof fixtures;

/**
 * The fixture set is immutable: screens read it, tests assert on it, and the
 * mock layer works on its own clone. A mutation attempt throws instead of
 * silently leaking into the next test.
 */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value) as string[]) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

deepFreeze(fixtures);
