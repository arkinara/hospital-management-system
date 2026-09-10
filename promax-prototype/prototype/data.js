/**
 * Shared seed data for every Pro Max prototype page.
 *
 * One source of truth means a patient's MRN, acuity and department are identical on
 * the list, the detail page, the booking flow and the invoice — which is what makes
 * a prototype reviewable instead of merely pretty.
 *
 * Clock: today is 9 Sep 2026.
 */
window.DB = (function () {
  const TODAY = '2026-09-09';

  const departments = [
    { id: 'GEN', name: 'General', beds: 48, occupied: 39, doctors: 4, color: 'info' },
    { id: 'PED', name: 'Pediatric', beds: 24, occupied: 15, doctors: 2, color: 'primary' },
    { id: 'CAR', name: 'Cardiology', beds: 20, occupied: 19, doctors: 2, color: 'accent' },
    { id: 'EMG', name: 'Emergency', beds: 16, occupied: 16, doctors: 2, color: 'danger' },
  ];

  const doctors = [
    { id: 'D01', name: 'Dr. Sari Wibowo', dept: 'CAR', spec: 'Interventional Cardiology', onDuty: true, shift: '07:00–15:00' },
    { id: 'D02', name: 'Dr. Adi Nugroho', dept: 'GEN', spec: 'Internal Medicine', onDuty: true, shift: '07:00–15:00' },
    { id: 'D03', name: 'Dr. Lina Hartono', dept: 'PED', spec: 'General Pediatrics', onDuty: true, shift: '08:00–16:00' },
    { id: 'D04', name: 'Dr. Rendra Pratama', dept: 'EMG', spec: 'Emergency Medicine', onDuty: true, shift: '23:00–07:00' },
    { id: 'D05', name: 'Dr. Maya Kusuma', dept: 'GEN', spec: 'Family Medicine', onDuty: true, shift: '15:00–23:00' },
    { id: 'D06', name: 'Dr. Bayu Setiawan', dept: 'CAR', spec: 'Echocardiography', onDuty: false, shift: '—' },
    { id: 'D07', name: 'Dr. Nadia Puspita', dept: 'PED', spec: 'Neonatology', onDuty: true, shift: '07:00–19:00' },
    { id: 'D08', name: 'Dr. Toni Halim', dept: 'GEN', spec: 'Gastroenterology', onDuty: false, shift: '—' },
    { id: 'D09', name: 'Dr. Ratna Dewi', dept: 'EMG', spec: 'Trauma', onDuty: true, shift: '07:00–19:00' },
    { id: 'D10', name: 'Dr. Yusuf Maulana', dept: 'GEN', spec: 'Pulmonology', onDuty: false, shift: '—' },
  ];

  /** acuity: critical | urgent | standard | routine — always paired with an icon, never colour alone. */
  const patients = [
    { mrn: 'P-001042', name: 'Budi Santoso',  dob: '1978-03-12', sex: 'M', nid: '3174052103780004', dept: 'CAR', doctor: 'D01', acuity: 'critical', status: 'admitted',   allergies: ['Penicillin'], phone: '+62 811 2043 118', lastVisit: '2026-09-09', balance: 4250000, insurer: 'BPJS Kesehatan' },
    { mrn: 'P-001108', name: 'Siti Rahayu',   dob: '1990-07-22', sex: 'F', nid: '3174056207900002', dept: 'GEN', doctor: 'D02', acuity: 'standard', status: 'outpatient', allergies: [],             phone: '+62 812 9911 402', lastVisit: '2026-09-08', balance: 0,       insurer: 'BPJS Kesehatan' },
    { mrn: 'P-000997', name: 'Agus Salim',    dob: '1965-11-02', sex: 'M', nid: '3174050211650001', dept: 'GEN', doctor: 'D05', acuity: 'urgent',   status: 'admitted',   allergies: ['Sulfa', 'Latex'], phone: '+62 813 4420 771', lastVisit: '2026-09-09', balance: 1150000, insurer: 'Mandiri Inhealth' },
    { mrn: 'P-001155', name: 'Dewi Lestari',  dob: '2015-01-30', sex: 'F', nid: '3174057001150003', dept: 'PED', doctor: 'D03', acuity: 'standard', status: 'outpatient', allergies: ['Peanut'],     phone: '+62 815 7712 330', lastVisit: '2026-09-07', balance: 350000,  insurer: 'Self-pay' },
    { mrn: 'P-001200', name: 'Rina Wijaya',   dob: '1988-09-14', sex: 'F', nid: '3174055409880005', dept: 'CAR', doctor: 'D01', acuity: 'routine',  status: 'outpatient', allergies: [],             phone: '+62 816 2288 190', lastVisit: '2026-08-28', balance: 0,       insurer: 'Prudential' },
    { mrn: 'P-001213', name: 'Hendra Gunawan',dob: '1972-05-19', sex: 'M', nid: '3174051905720008', dept: 'EMG', doctor: 'D04', acuity: 'critical', status: 'admitted',   allergies: ['Aspirin'],    phone: '+62 817 5540 226', lastVisit: '2026-09-09', balance: 8900000, insurer: 'BPJS Kesehatan' },
    { mrn: 'P-001231', name: 'Putri Anggraini',dob:'1996-12-03', sex: 'F', nid: '3174054312960007', dept: 'GEN', doctor: 'D02', acuity: 'routine',  status: 'outpatient', allergies: [],             phone: '+62 818 3301 774', lastVisit: '2026-09-02', balance: 275000,  insurer: 'Self-pay' },
    { mrn: 'P-001244', name: 'Joko Prasetyo', dob: '1959-02-08', sex: 'M', nid: '3174050802590006', dept: 'CAR', doctor: 'D06', acuity: 'urgent',   status: 'outpatient', allergies: ['Iodine'],     phone: '+62 819 6612 085', lastVisit: '2026-09-06', balance: 2100000, insurer: 'Mandiri Inhealth' },
    { mrn: 'P-001255', name: 'Ayu Kartika',   dob: '2019-06-25', sex: 'F', nid: '3174056506190009', dept: 'PED', doctor: 'D07', acuity: 'standard', status: 'admitted',   allergies: [],             phone: '+62 811 7788 341', lastVisit: '2026-09-09', balance: 640000,  insurer: 'BPJS Kesehatan' },
    { mrn: 'P-001266', name: 'Fajar Nugraha', dob: '1984-10-11', sex: 'M', nid: '3174051110840012', dept: 'GEN', doctor: 'D08', acuity: 'routine',  status: 'discharged', allergies: [],             phone: '+62 812 2119 668', lastVisit: '2026-08-30', balance: 0,       insurer: 'Prudential' },
    { mrn: 'P-001271', name: 'Lestari Ningsih',dob:'1993-04-17', sex: 'F', nid: '3174055704930011', dept: 'GEN', doctor: 'D02', acuity: 'standard', status: 'outpatient', allergies: ['Codeine'],    phone: '+62 813 8890 254', lastVisit: '2026-09-05', balance: 480000,  insurer: 'BPJS Kesehatan' },
    { mrn: 'P-001288', name: 'Rizky Ramadhan',dob: '2001-08-09', sex: 'M', nid: '3174050908010010', dept: 'EMG', doctor: 'D09', acuity: 'urgent',   status: 'admitted',   allergies: [],             phone: '+62 815 4402 913', lastVisit: '2026-09-09', balance: 3300000, insurer: 'Self-pay' },
  ];

  /** Appointment slots for the doctor day calendar. status: open | booked | blocked | held */
  const slots = [
    { time: '08:00', status: 'booked',  patient: 'P-001042', reason: 'Post-PCI follow-up' },
    { time: '08:30', status: 'booked',  patient: 'P-001200', reason: 'Echo review' },
    { time: '09:00', status: 'open' },
    { time: '09:30', status: 'booked',  patient: 'P-001244', reason: 'Chest pain workup' },
    { time: '10:00', status: 'blocked', reason: 'Cath lab block' },
    { time: '10:30', status: 'blocked', reason: 'Cath lab block' },
    { time: '11:00', status: 'open' },
    { time: '11:30', status: 'open' },
    { time: '12:00', status: 'blocked', reason: 'Lunch' },
    { time: '12:30', status: 'open' },
    { time: '13:00', status: 'booked',  patient: 'P-001108', reason: 'Hypertension review' },
    { time: '13:30', status: 'open' },
    { time: '14:00', status: 'held',    reason: 'Held for ER referral' },
    { time: '14:30', status: 'open' },
  ];

  const appointments = [
    { id: 'A-8801', time: '08:00', patient: 'P-001042', doctor: 'D01', dept: 'CAR', status: 'checked_in', reason: 'Post-PCI follow-up', wait: 4 },
    { id: 'A-8802', time: '08:30', patient: 'P-001200', doctor: 'D01', dept: 'CAR', status: 'completed',  reason: 'Echo review', wait: 0 },
    { id: 'A-8803', time: '09:00', patient: 'P-001108', doctor: 'D02', dept: 'GEN', status: 'booked',     reason: 'Hypertension review', wait: 0 },
    { id: 'A-8804', time: '09:15', patient: 'P-001155', doctor: 'D03', dept: 'PED', status: 'checked_in', reason: 'Asthma review', wait: 12 },
    { id: 'A-8805', time: '09:30', patient: 'P-001244', doctor: 'D06', dept: 'CAR', status: 'no_show',    reason: 'Chest pain workup', wait: 0 },
    { id: 'A-8806', time: '10:00', patient: 'P-000997', doctor: 'D05', dept: 'GEN', status: 'booked',     reason: 'Wound dressing', wait: 0 },
    { id: 'A-8807', time: '10:30', patient: 'P-001231', doctor: 'D02', dept: 'GEN', status: 'cancelled',  reason: 'Lab follow-up', wait: 0 },
    { id: 'A-8808', time: '11:00', patient: 'P-001255', doctor: 'D07', dept: 'PED', status: 'checked_in', reason: 'Fever, 3 days', wait: 21 },
    { id: 'A-8809', time: '11:30', patient: 'P-001271', doctor: 'D02', dept: 'GEN', status: 'booked',     reason: 'Migraine', wait: 0 },
    { id: 'A-8810', time: '13:00', patient: 'P-001288', doctor: 'D09', dept: 'EMG', status: 'booked',     reason: 'Suture removal', wait: 0 },
  ];

  /** Cross-department unified timeline for Budi Santoso (P-001042). */
  const timeline = [
    { at: '2026-09-09 07:42', dept: 'CAR', kind: 'vitals',      by: 'Nurse Wati Lestari', title: 'Vitals recorded', body: 'BP 148/94 · HR 88 · SpO₂ 96% · Temp 36.8°C · RR 18' },
    { at: '2026-09-08 16:10', dept: 'CAR', kind: 'prescription',by: 'Dr. Sari Wibowo', title: 'Prescription issued', body: 'Bisoprolol 5 mg — 1×/day, 30 days · Atorvastatin 20 mg — 1×/night, 30 days' },
    { at: '2026-09-08 15:55', dept: 'CAR', kind: 'note',        by: 'Dr. Sari Wibowo', title: 'Visit note — Post-PCI review', body: 'Stable angina, NYHA II. Stent patent on angiography. Continue dual antiplatelet therapy. Review in 4 weeks.', dx: 'I25.10 — Atherosclerotic heart disease' },
    { at: '2026-09-04 11:20', dept: 'GEN', kind: 'lab',         by: 'Dr. Adi Nugroho', title: 'Lab result — Lipid panel', body: 'LDL 138 mg/dL (high) · HDL 41 · TG 190 · Total 214', flag: 'abnormal' },
    { at: '2026-08-30 09:05', dept: 'GEN', kind: 'note',        by: 'Dr. Adi Nugroho', title: 'Visit note — Routine review', body: 'Reports mild exertional dyspnoea. Referred to Cardiology for stress testing.', dx: 'R06.00 — Dyspnoea, unspecified' },
    { at: '2026-08-21 14:30', dept: 'EMG', kind: 'admission',   by: 'Dr. Rendra Pratama', title: 'Emergency admission', body: 'Presented with chest tightness 40 min. Troponin negative ×2. Discharged same day with cardiology referral.' },
    { at: '2026-07-19 10:00', dept: 'CAR', kind: 'procedure',   by: 'Dr. Sari Wibowo', title: 'Procedure — PCI with DES', body: 'Single-vessel PCI to LAD, drug-eluting stent 3.0×18 mm. No complications.' },
  ];

  const vitals = [
    { at: '09-03', sys: 156, dia: 98,  hr: 92 },
    { at: '09-04', sys: 152, dia: 96,  hr: 90 },
    { at: '09-05', sys: 150, dia: 95,  hr: 89 },
    { at: '09-06', sys: 147, dia: 93,  hr: 86 },
    { at: '09-07', sys: 145, dia: 92,  hr: 84 },
    { at: '09-08', sys: 149, dia: 94,  hr: 88 },
    { at: '09-09', sys: 148, dia: 94,  hr: 88 },
  ];

  const invoices = [
    { id: 'INV-2026-0918', patient: 'P-001042', date: '2026-09-09', total: 12450000, paid: 8200000, status: 'partially_paid', insurer: 'BPJS Kesehatan', claim: 'submitted' },
    { id: 'INV-2026-0917', patient: 'P-001213', date: '2026-09-09', total: 8900000,  paid: 0,       status: 'unpaid',         insurer: 'BPJS Kesehatan', claim: 'draft' },
    { id: 'INV-2026-0916', patient: 'P-001288', date: '2026-09-09', total: 3300000,  paid: 0,       status: 'unpaid',         insurer: 'Self-pay',       claim: 'none' },
    { id: 'INV-2026-0915', patient: 'P-001255', date: '2026-09-09', total: 640000,   paid: 640000,  status: 'paid',           insurer: 'BPJS Kesehatan', claim: 'approved' },
    { id: 'INV-2026-0914', patient: 'P-000997', date: '2026-09-08', total: 1150000,  paid: 0,       status: 'unpaid',         insurer: 'Mandiri Inhealth', claim: 'denied' },
    { id: 'INV-2026-0913', patient: 'P-001244', date: '2026-09-06', total: 2100000,  paid: 500000,  status: 'partially_paid', insurer: 'Mandiri Inhealth', claim: 'submitted' },
    { id: 'INV-2026-0912', patient: 'P-001271', date: '2026-09-05', total: 480000,   paid: 0,       status: 'unpaid',         insurer: 'BPJS Kesehatan', claim: 'draft' },
    { id: 'INV-2026-0911', patient: 'P-001231', date: '2026-09-02', total: 275000,   paid: 275000,  status: 'paid',           insurer: 'Self-pay',       claim: 'none' },
    { id: 'INV-2026-0910', patient: 'P-001108', date: '2026-09-01', total: 890000,   paid: 890000,  status: 'paid',           insurer: 'BPJS Kesehatan', claim: 'approved' },
  ];

  const invoiceLines = [
    { code: 'CONS-CAR', desc: 'Cardiology consultation — Dr. Sari Wibowo', qty: 1, unit: 450000, dept: 'CAR' },
    { code: 'PROC-ECHO', desc: 'Echocardiography, transthoracic', qty: 1, unit: 1850000, dept: 'CAR' },
    { code: 'LAB-TROP', desc: 'Troponin I, high sensitivity', qty: 2, unit: 320000, dept: 'GEN' },
    { code: 'LAB-LIPID', desc: 'Lipid panel, fasting', qty: 1, unit: 275000, dept: 'GEN' },
    { code: 'ROOM-CAR-2', desc: 'Ward bed, Cardiology class 2 — 3 nights', qty: 3, unit: 1750000, dept: 'CAR' },
    { code: 'PHARM-BISO', desc: 'Bisoprolol 5 mg tab × 30', qty: 1, unit: 185000, dept: 'CAR' },
    { code: 'PHARM-ATOR', desc: 'Atorvastatin 20 mg tab × 30', qty: 1, unit: 240000, dept: 'CAR' },
  ];

  const users = [
    { id: 'U-101', name: 'Rahmat Hidayat',  email: 'rahmat.h@sirkaya.health',  role: 'Admin',        dept: '—',   status: 'active',   lastLogin: '2026-09-09 06:58', mfa: true },
    { id: 'U-102', name: 'Dr. Sari Wibowo', email: 'sari.w@sirkaya.health',    role: 'Doctor',       dept: 'CAR', status: 'active',   lastLogin: '2026-09-09 07:12', mfa: true },
    { id: 'U-103', name: 'Dr. Adi Nugroho', email: 'adi.n@sirkaya.health',     role: 'Doctor',       dept: 'GEN', status: 'active',   lastLogin: '2026-09-09 07:40', mfa: false },
    { id: 'U-104', name: 'Wati Lestari',    email: 'wati.l@sirkaya.health',    role: 'Nurse',        dept: 'CAR', status: 'active',   lastLogin: '2026-09-09 06:45', mfa: true },
    { id: 'U-105', name: 'Ika Permata',     email: 'ika.p@sirkaya.health',     role: 'Receptionist', dept: 'GEN', status: 'active',   lastLogin: '2026-09-09 07:01', mfa: false },
    { id: 'U-106', name: 'Dr. Lina Hartono',email: 'lina.h@sirkaya.health',    role: 'Doctor',       dept: 'PED', status: 'active',   lastLogin: '2026-09-08 16:22', mfa: true },
    { id: 'U-107', name: 'Bagus Saputra',   email: 'bagus.s@sirkaya.health',   role: 'Nurse',        dept: 'EMG', status: 'invited',  lastLogin: '—',                mfa: false },
    { id: 'U-108', name: 'Sinta Maharani',  email: 'sinta.m@sirkaya.health',   role: 'Receptionist', dept: 'PED', status: 'inactive', lastLogin: '2026-06-14 09:30', mfa: false },
  ];

  /** Widget catalogue. locked = admin lock wins over any per-user layout. */
  const widgets = [
    { key: 'todays-appointments',  name: "Today's Appointments", desc: 'Live day queue with status and wait time.', size: 'lg', roles: ['Admin', 'Receptionist', 'Doctor'], enabled: true,  locked: true,  icon: 'calendar-clock' },
    { key: 'recent-patients',      name: 'Recent Patients',      desc: 'Last 10 patients you touched.',            size: 'md', roles: ['Admin', 'Doctor', 'Nurse'],        enabled: true,  locked: false, icon: 'users' },
    { key: 'department-occupancy', name: 'Department Occupancy',  desc: 'Bed utilisation per department.',          size: 'md', roles: ['Admin'],                           enabled: true,  locked: false, icon: 'bed-double' },
    { key: 'revenue-month',        name: 'Revenue This Month',    desc: 'Billed vs collected, running total.',      size: 'md', roles: ['Admin'],                           enabled: true,  locked: false, icon: 'trending-up' },
    { key: 'pending-records',      name: 'Pending Records',       desc: 'Visit notes not yet signed off.',          size: 'md', roles: ['Admin', 'Doctor'],                 enabled: true,  locked: true,  icon: 'file-clock' },
    { key: 'staff-on-duty',        name: 'Staff On Duty',         desc: 'Who is on shift, by department.',          size: 'sm', roles: ['Admin'],                           enabled: true,  locked: false, icon: 'badge-check' },
    { key: 'registration-queue',   name: 'Registration Queue',    desc: 'Walk-ins waiting to be registered.',       size: 'lg', roles: ['Receptionist'],                    enabled: true,  locked: false, icon: 'clipboard-list' },
    { key: 'todays-schedule',      name: "Today's Schedule",      desc: 'Your own clinic day, slot by slot.',       size: 'lg', roles: ['Doctor'],                          enabled: true,  locked: true,  icon: 'calendar-days' },
    { key: 'vitals-queue',         name: 'Vitals Queue',          desc: 'Patients with vitals pending intake.',     size: 'md', roles: ['Doctor', 'Nurse'],                 enabled: true,  locked: false, icon: 'activity' },
    { key: 'assigned-patients',    name: 'Assigned Patients',     desc: 'Your ward assignment for this shift.',     size: 'lg', roles: ['Nurse'],                           enabled: true,  locked: false, icon: 'user-check' },
    { key: 'vitals-entry',         name: 'Vitals Entry',          desc: 'Fast inline vitals capture.',              size: 'md', roles: ['Nurse'],                           enabled: true,  locked: false, icon: 'stethoscope' },
    { key: 'care-plan',            name: 'Care Plan',             desc: 'Active care plan items due this shift.',   size: 'md', roles: ['Nurse'],                           enabled: false, locked: false, icon: 'list-checks' },
  ];

  const pendingRecords = [
    { id: 'R-4412', patient: 'P-001042', dept: 'CAR', doctor: 'D01', visit: '2026-09-09 08:00', age: '2h 14m', state: 'draft' },
    { id: 'R-4411', patient: 'P-001155', dept: 'PED', doctor: 'D03', visit: '2026-09-09 09:15', age: '1h 02m', state: 'draft' },
    { id: 'R-4409', patient: 'P-000997', dept: 'GEN', doctor: 'D05', visit: '2026-09-08 15:30', age: '18h',    state: 'submitted' },
    { id: 'R-4405', patient: 'P-001288', dept: 'EMG', doctor: 'D09', visit: '2026-09-08 22:10', age: '11h',    state: 'draft' },
    { id: 'R-4398', patient: 'P-001271', dept: 'GEN', doctor: 'D02', visit: '2026-09-05 10:00', age: '4d',     state: 'submitted' },
  ];

  const revenue = [
    { d: '01', billed: 148, collected: 121 }, { d: '02', billed: 162, collected: 130 },
    { d: '03', billed: 139, collected: 118 }, { d: '04', billed: 171, collected: 142 },
    { d: '05', billed: 158, collected: 133 }, { d: '06', billed: 96,  collected: 74 },
    { d: '07', billed: 88,  collected: 69 },  { d: '08', billed: 176, collected: 148 },
    { d: '09', billed: 183, collected: 121 },
  ];

  const visitsTrend = [42, 48, 45, 51, 47, 29, 24, 55, 61];
  const admitTrend = [11, 13, 10, 14, 12, 7, 6, 15, 17];
  const claimAging = [
    { bucket: '0–15d', count: 42, value: 186 },
    { bucket: '16–30d', count: 27, value: 121 },
    { bucket: '31–60d', count: 14, value: 78 },
    { bucket: '60d+', count: 6, value: 41 },
  ];

  /** role × module × action. Admin is immutable in the UI (guard rail, not a preference). */
  const modules = ['Patients', 'Appointments', 'Records', 'Billing', 'Admin', 'Reports'];
  const actions = ['view', 'create', 'edit', 'delete'];
  const permissions = {
    Admin:        { Patients: 'vced', Appointments: 'vced', Records: 'vced', Billing: 'vced', Admin: 'vced', Reports: 'v' },
    Doctor:       { Patients: 'vce',  Appointments: 'vce',  Records: 'vce',  Billing: '',     Admin: '',     Reports: 'v' },
    Nurse:        { Patients: 'v',    Appointments: 'v',    Records: 'vc',   Billing: '',     Admin: '',     Reports: '' },
    Receptionist: { Patients: 'vce',  Appointments: 'vced', Records: 'v',    Billing: 'vc',   Admin: '',     Reports: '' },
  };

  /** Nav is derived from permissions — the shell never hard-codes a role's menu. */
  const nav = [
    { key: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', href: null, module: null },
    { key: 'patients', label: 'Patients', icon: 'users', href: '03-patient-list.html', module: 'Patients' },
    { key: 'appointments', label: 'Appointments', icon: 'calendar-days', href: '05-appointment-booking.html', module: 'Appointments' },
    { key: 'records', label: 'Records', icon: 'file-text', href: '07-record-entry.html', module: 'Records' },
    { key: 'billing', label: 'Billing', icon: 'receipt-text', href: '08-billing.html', module: 'Billing' },
    {
      key: 'admin', label: 'Admin', icon: 'shield-check', module: 'Admin', children: [
        { key: 'users', label: 'Users', icon: 'user-cog', href: '09-admin-users.html' },
        { key: 'departments', label: 'Departments', icon: 'building-2', href: '10-admin-departments.html' },
        { key: 'widgets', label: 'Widget Library', icon: 'layout-grid', href: '11-admin-widget-library.html' },
        { key: 'permissions', label: 'Permissions', icon: 'key-round', href: '12-admin-permissions.html' },
      ],
    },
    { key: 'reports', label: 'Reports', icon: 'bar-chart-3', href: null, module: 'Reports' },
  ];

  const dashboardFor = {
    Admin: '02-admin-dashboard.html',
    Receptionist: '13-receptionist-dashboard.html',
    Doctor: '14-doctor-dashboard.html',
    Nurse: '15-nurse-dashboard.html',
  };

  const sessions = {
    Admin:        { name: 'Rahmat Hidayat',   role: 'Admin',        dept: '—',          initials: 'RH' },
    Doctor:       { name: 'Dr. Sari Wibowo',  role: 'Doctor',       dept: 'Cardiology', initials: 'SW' },
    Nurse:        { name: 'Wati Lestari',     role: 'Nurse',        dept: 'Cardiology', initials: 'WL' },
    Receptionist: { name: 'Ika Permata',      role: 'Receptionist', dept: 'General',    initials: 'IP' },
  };

  // ----- Lookups & formatters -----
  const byMrn = (mrn) => patients.find((p) => p.mrn === mrn) || { name: 'Unknown', mrn };
  const byDoctor = (id) => doctors.find((d) => d.id === id) || { name: 'Unassigned', dept: '—' };
  const deptName = (id) => (departments.find((d) => d.id === id) || { name: id }).name;
  const age = (dob) => {
    const [y, m, d] = dob.split('-').map(Number);
    const [ty, tm, td] = TODAY.split('-').map(Number);
    let a = ty - y;
    if (tm < m || (tm === m && td < d)) a -= 1;
    return a;
  };
  /** Indonesian grouping, no decimals: Rp 1.750.000 */
  const rp = (n) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
  const jt = (n) => 'Rp ' + (n / 1_000_000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' jt';
  const pct = (a, b) => (b === 0 ? 0 : Math.round((a / b) * 100));

  return {
    TODAY, departments, doctors, patients, slots, appointments, timeline, vitals,
    invoices, invoiceLines, users, widgets, pendingRecords, revenue, visitsTrend,
    admitTrend, claimAging, modules, actions, permissions, nav, dashboardFor, sessions,
    byMrn, byDoctor, deptName, age, rp, jt, pct,
  };
})();
