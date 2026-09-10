import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  allDepartments,
  appointments,
  claims,
  departments,
  doctors,
  fixtures,
  patientAllergies,
  patients,
  permissionMatrix,
  timeline,
  users,
  vitalReadings,
  widgets,
} from "@/lib/fixtures";
import type {
  Appointment,
  Department,
  Doctor,
  Invoice,
  Patient,
  PermissionMatrixEntry,
  Role,
  User,
  Vitals,
  Widget,
} from "@/lib/fixtures";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The twelve prototype rows, copied verbatim from
 * `promax-prototype/prototype/data.js`. A port that drifts from these fails.
 */
const PROTOTYPE_PATIENTS: Array<{
  mrn: string;
  name: string;
  dob: string;
  sex: string;
  nid: string;
  dept: string;
  doctor: string;
  acuity: string;
  status: string;
  allergies: string[];
  phone: string;
  lastVisit: string;
  balance: number;
  insurer: string;
}> = [
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

describe("fixtures: prototype parity", () => {
  it("reproduces the twelve prototype patient records exactly", () => {
    expect(patients.slice(0, 12)).toEqual(PROTOTYPE_PATIENTS);
  });

  it("keeps the locked PRD counts (10 doctors, 4 core departments, 100 patients)", () => {
    expect(doctors).toHaveLength(10);
    expect(departments).toHaveLength(4);
    expect(patients).toHaveLength(100);
  });

  it("keeps the frozen clock at 9 Sep 2026", () => {
    expect(fixtures.today).toBe("2026-09-09");
  });
});

describe("fixtures: typed against the API schema", () => {
  it("patients match the Patient type", () => {
    expectTypeOf(patients[0]).toEqualTypeOf<Patient>();
    expectTypeOf(patients).toEqualTypeOf<Patient[]>();
  });

  it("departments, doctors, users and widgets are typed", () => {
    expectTypeOf(departments[0]).toEqualTypeOf<Department>();
    expectTypeOf(doctors[0]).toEqualTypeOf<Doctor>();
    expectTypeOf(users[0]).toEqualTypeOf<User>();
    expectTypeOf(widgets[0]).toEqualTypeOf<Widget>();
    expectTypeOf(appointments[0]).toEqualTypeOf<Appointment>();
  });

  it("fixture source files contain no explicit any", () => {
    for (const file of ["types.ts", "data.ts"]) {
      const src = readFileSync(path.resolve(here, "../src/lib/fixtures", file), "utf-8");
      expect(src).not.toMatch(/:\s*any\b/);
      expect(src).not.toMatch(/\bany\s*\[\s*\]/);
    }
  });

  it("mutating a fixture throws (immutable dataset, no cross-test leaks)", () => {
    expect(() => (patients as unknown as Patient[]).push({} as Patient)).toThrow();
    expect(() => (fixtures.patients as unknown as Patient[]).pop()).toThrow();
  });
});

describe("fixtures: awkward states a screen must render", () => {
  it("has a patient with a penicillin allergy", () => {
    const budi = patients.find((p) => p.mrn === "P-001042");
    expect(budi?.allergies).toContain("Penicillin");
    expect(patientAllergies.some((a) => a.patient === "P-001042" && a.substance === "Penicillin")).toBe(true);
  });

  it("has a denied claim with a denial reason and an appeal deadline", () => {
    const denied = claims.find((c) => c.status === "denied");
    expect(denied).toBeDefined();
    expect(denied?.denialReason).toBeTruthy();
    expect(denied?.appealDeadline).toBeTruthy();
  });

  it("has an unstaffed department", () => {
    expect(allDepartments.some((d) => !d.staffed)).toBe(true);
    expect(allDepartments.find((d) => !d.staffed)?.doctors).toBe(0);
  });

  it("has an overdue vitals reading", () => {
    expect(vitalReadings.some((v) => v.overdue)).toBe(true);
  });

  it("has a patient with critical acuity", () => {
    expect(patients.filter((p) => p.acuity === "critical").length).toBeGreaterThan(0);
  });

  it("has cancelled and no_show appointments", () => {
    expect(appointments.some((a) => a.status === "cancelled")).toBe(true);
    expect(appointments.some((a) => a.status === "no_show")).toBe(true);
  });

  it("has a locked widget (admin override)", () => {
    expect(widgets.some((w) => w.locked)).toBe(true);
  });

  it("has cross-department visit history for Budi", () => {
    const depts = new Set(timeline.map((t) => t.dept));
    expect(depts.has("CAR")).toBe(true);
    expect(depts.has("GEN")).toBe(true);
    expect(depts.has("EMG")).toBe(true);
  });

  it("has all four roles with explicit permission matrix entries", () => {
    const roles = new Set(permissionMatrix.map((p) => p.role));
    expect((["admin", "doctor", "nurse", "receptionist"] as Role[]).every((r) => roles.has(r))).toBe(true);
    expect(users.map((u) => u.role)).toEqual(
      expect.arrayContaining(["Admin", "Doctor", "Nurse", "Receptionist"]),
    );
  });

  it("permission matrix is 4 roles × 7 modules = 28 explicit rows", () => {
    expect(permissionMatrix).toHaveLength(28);
    for (const role of ["admin", "doctor", "nurse", "receptionist"]) {
      expect(permissionMatrix.filter((p) => p.role === role)).toHaveLength(7);
    }
    expectTypeOf(permissionMatrix[0]).toEqualTypeOf<PermissionMatrixEntry>();
  });

  it("covers a 30-day vitals history", () => {
    const budi = vitalReadings.filter((v) => v.patient === "P-001042");
    expect(budi.length).toBe(30);
    expectTypeOf(budi[0]).toEqualTypeOf<Vitals>();
  });

  it("has 30 days of history on the frozen clock", () => {
    const oldest = vitalReadings
      .filter((v) => v.patient === "P-001042")
      .map((v) => v.recordedAt.slice(0, 10));
    const newest = new Date("2026-09-09T00:00:00Z");
    const oldestDate = new Date(`${oldest[oldest.length - 1].slice(0, 10)}T00:00:00Z`);
    expect((newest.getTime() - oldestDate.getTime()) / 86_400_000).toBeGreaterThanOrEqual(29);
  });

  it("invoices are typed", () => {
    expectTypeOf(fixtures.invoices[0]).toEqualTypeOf<Invoice>();
  });
});