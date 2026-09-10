"use client";

import React from "react";
import {
  AcuityBadge,
  AppShell,
  Button,
  CommandPalette,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  FilterChip,
  Meter,
  MetricCard,
  PatientHeader,
  PermissionMatrix,
  Sparkline,
  SkeletonRows,
  StateRegion,
  StateSwitch,
  StatusChip,
  Timeline,
  ToastProvider,
  useToast,
  WidgetGrid,
  type Column,
  type Density,
  type ModuleName,
  type NavItem,
  type PermissionMatrixData,
  type Role,
  type StatusKey,
  type TimelineEntry,
} from "@/components/ui";
import { useDensity } from "@/hooks/useDensity";
import { useTheme } from "@/hooks/useTheme";
import { renderIcon } from "@/lib/iconRenderer";

const MODULES: ModuleName[] = [
  "Patients",
  "Appointments",
  "Records",
  "Billing",
  "Admin",
  "Reports",
];

const PERMISSIONS: PermissionMatrixData = {
  Admin: { Patients: "vced", Appointments: "vced", Records: "vced", Billing: "vced", Admin: "vced", Reports: "vced" },
  Doctor: { Patients: "vced", Appointments: "vce", Records: "vced", Billing: "v", Admin: "", Reports: "v" },
  Nurse: { Patients: "vce", Appointments: "vc", Records: "vce", Billing: "v", Admin: "", Reports: "v" },
  Receptionist: { Patients: "vc", Appointments: "vced", Records: "v", Billing: "vced", Admin: "", Reports: "v" },
};

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: "activity", href: "#dashboard" },
  { key: "patients", label: "Patients", icon: "users", href: "#patients", module: "Patients" },
  { key: "appointments", label: "Appointments", icon: "calendar-days", href: "#appointments", module: "Appointments" },
  { key: "records", label: "Records", icon: "file-text", href: "#records", module: "Records" },
  { key: "billing", label: "Billing", icon: "receipt-text", href: "#billing", module: "Billing" },
  { key: "admin", label: "Admin", icon: "shield-check", href: "#admin", module: "Admin" },
  { key: "reports", label: "Reports", icon: "bar-chart-3", href: "#reports", module: "Reports" },
];

type Row = { id: string; mrn: string; name: string; status: StatusKey; acuity: "critical" | "urgent" | "standard" | "routine"; wait: number };

const ROWS: Row[] = [
  { id: "1", mrn: "P-001042", name: "Ayu Lestari", status: "checked_in", acuity: "urgent", wait: 12 },
  { id: "2", mrn: "P-001118", name: "Budi Santoso", status: "booked", acuity: "standard", wait: 34 },
  { id: "3", mrn: "P-001204", name: "Citra Dewi", status: "in_progress", acuity: "critical", wait: 4 },
];

const TIMELINE: TimelineEntry[] = [
  { id: "t1", at: "2026-09-09 07:42", kind: "vitals", department: "GEN", departmentName: "General", author: "Nurse Rina", title: "Vitals recorded", body: "BP 128/82, HR 88, SpO2 98% on room air." },
  { id: "t2", at: "2026-09-09 08:05", kind: "lab", department: "LAB", departmentName: "Laboratory", author: "Dr. Pratama", title: "Full blood count", body: "Haemoglobin 11.2 g/dL, flagged below range.", flagged: true, diagnosis: "D50.9 Iron deficiency anaemia" },
];

const PALETTE = [
  ["bg", "bg-background"],
  ["surface-0", "bg-surface-0"],
  ["surface-1", "bg-surface-1"],
  ["surface-2", "bg-surface-2"],
  ["surface-3", "bg-surface-3"],
  ["surface-4", "bg-surface-4"],
  ["primary", "bg-primary"],
  ["primary-container", "bg-primary-container"],
  ["accent", "bg-accent"],
  ["success", "bg-success"],
  ["warning", "bg-warning"],
  ["danger", "bg-danger"],
  ["info", "bg-info"],
] as const;

const TYPE = [
  ["3xl 30px", "text-3xl font-bold"],
  ["2xl 24px", "text-2xl font-semibold"],
  ["xl 20px", "text-xl font-semibold"],
  ["lg 17px", "text-lg font-semibold"],
  ["md 15px", "text-md"],
  ["base 14px", "text-base"],
  ["sm 13px", "text-sm"],
  ["xs 12px", "text-xs"],
  ["2xs 11px", "text-2xs"],
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Catalogue({
  density,
  toggleDensity,
}: {
  density: Density;
  toggleDensity: () => void;
}) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [state, setState] = React.useState<"ready" | "loading" | "empty" | "error">("ready");
  const [selectedModules, setSelectedModules] = React.useState<ModuleName[]>([...MODULES]);
  const [draft, setDraft] = React.useState<PermissionMatrixData>(PERMISSIONS);
  const [order, setOrder] = React.useState(["bed", "census", "revenue", "waiting"]);

  const columns: Column<Row>[] = [
    { key: "mrn", label: "MRN", mono: true, width: "120px" },
    { key: "name", label: "Patient" },
    { key: "status", label: "Status", cell: (r) => <StatusChip status={r.status} renderIcon={renderIcon} /> },
    { key: "acuity", label: "Acuity", cell: (r) => <AcuityBadge acuity={r.acuity} renderIcon={renderIcon} />, sortValue: (r) => r.acuity },
    { key: "wait", label: "Wait (min)", align: "right", mono: true, cell: (r) => <span className="num">{r.wait}</span> },
  ];

  const widgets = [
    { key: "bed", name: "Bed occupancy", icon: "bed-double", roles: ["Admin"] as Role[], enabled: true, locked: true, span: "xl:col-span-2", meta: "48 beds", render: () => <Meter label="ICU" value={9} max={10} sub="1 bed free · 10 total" /> },
    { key: "census", name: "Census", icon: "users", roles: ["Admin"] as Role[], enabled: true, locked: false, render: () => <MetricCard label="Inpatients" value={128} delta={3} deltaLabel="vs last week" renderIcon={renderIcon} /> },
    { key: "revenue", name: "Revenue", icon: "wallet", roles: ["Admin"] as Role[], enabled: true, locked: false, render: () => <MetricCard label="Collected today" value="Rp 42,1 jt" tone="inverse" delta={-4} renderIcon={renderIcon} /> },
    { key: "waiting", name: "Waiting", icon: "hourglass", roles: ["Admin"] as Role[], enabled: true, locked: false, render: () => <MetricCard label="Avg wait" value={18} unit="min" delta={2} renderIcon={renderIcon} spark={<Sparkline values={[12, 15, 11, 18, 14, 20, 18]} />} /> },
  ];

  return (
    <div className="sec-gap p-3 sm:p-4 lg:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold">Component catalogue</h1>
          <p className="text-base text-muted">
            Every component in both themes and both densities. Token seed lives only in{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-2xs">src/styles/tokens.css</code>.
          </p>
        </div>
        <StateSwitch state={state} onChange={setState} />
        <Button variant="outline" icon={renderIcon("rows-3", "h-4 w-4")} onClick={toggleDensity}>
          {density === "compact" ? "Comfortable" : "Compact"} density
        </Button>
        <Button variant="outline" icon={renderIcon("search", "h-4 w-4")} onClick={() => setPaletteOpen(true)}>
          Command palette
        </Button>
      </header>

      <Section title="Colour tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {PALETTE.map(([name, cls]) => (
            <div key={name} className="min-w-0">
              <div className={`${cls} h-12 rounded-lg border border-outline`} />
              <p className="mt-1 truncate text-2xs text-muted">{name}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type scale">
        <div className="space-y-2">
          {TYPE.map(([label, cls]) => (
            <div key={label} className="flex items-baseline gap-4">
              <span className="w-20 shrink-0 text-2xs text-subtle">{label}</span>
              <span className={cls}>The quick brown fox — 0123456789</span>
            </div>
          ))}
          <p className="num text-base">Fira Code tabular: Rp 1.750.000 · MRN P-001042</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Primary</Button>
          <Button variant="accent">Accent</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="subtle">Subtle</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="primary" loading>
            Saving
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <Button variant="outline" icon={renderIcon("plus", "h-4 w-4")}>
            With icon
          </Button>
          <Button variant="ghost" label="Search" icon={renderIcon("search", "h-4 w-4")} />
        </div>
      </Section>

      <Section title="Fields">
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="sg-name" label="Full name" placeholder="e.g. Ayu Lestari" required help="As printed on the national ID." />
          <Field id="sg-nid" label="National ID" mono inputMode="numeric" error="National ID must be exactly 16 digits (you entered 14)" />
          <Field id="sg-email" label="Email" type="email" optional autoComplete="email" />
          <Field id="sg-pass" label="Password" type="password" help="Minimum 12 characters." />
          <Field id="sg-dept" label="Department" type="select" options={[{ label: "General" }, { label: "Emergency" }, { label: "Cardiology" }]} />
          <Field id="sg-notes" label="Notes" type="textarea" help="Persistent helper text." />
        </div>
      </Section>

      <Section title="Status & acuity">
        <div className="flex flex-wrap gap-2">
          {(["booked", "checked_in", "completed", "cancelled", "no_show", "paid", "unpaid", "overdue"] as StatusKey[]).map((s) => (
            <StatusChip key={s} status={s} renderIcon={renderIcon} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <AcuityBadge acuity="critical" renderIcon={renderIcon} />
          <AcuityBadge acuity="urgent" renderIcon={renderIcon} />
          <AcuityBadge acuity="standard" renderIcon={renderIcon} />
          <AcuityBadge acuity="routine" renderIcon={renderIcon} />
        </div>
      </Section>

      <Section title="Metrics, meters & sparklines">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Appointments" value={61} delta={11} deltaLabel="vs last Tuesday" icon="calendar-days" renderIcon={renderIcon} />
          <MetricCard label="No-shows" value={7} tone="inverse" delta={-2} deltaLabel="vs last Tuesday" icon="user-x" renderIcon={renderIcon} />
          <MetricCard label="Collected" value="Rp 42,1 jt" delta={4} icon="wallet" renderIcon={renderIcon} spark={<Sparkline values={[20, 28, 24, 31, 35, 30, 42]} />} />
          <div className="card flex flex-col justify-center gap-4">
            <Meter label="Ward A" value={38} max={48} sub="10 beds free · 48 total" />
            <Meter label="ICU" value={10} max={10} sub="Full — escalate admissions" />
          </div>
        </div>
      </Section>

      <Section title="DataTable">
        <DataTable
          rows={ROWS}
          columns={columns}
          rowKey={(r) => r.id}
          label="Waiting list"
          caption="Patients currently waiting, with acuity and wait time."
          selectable
          initialSort={{ key: "wait", dir: "asc" }}
          renderIcon={renderIcon}
          mobileCard={(r) => (
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{r.name}</span>
              <StatusChip status={r.status} renderIcon={renderIcon} size="sm" />
            </div>
          )}
        />
      </Section>

      <Section title="State region">
        <StateRegion
          state={state}
          ready={<DataTable rows={ROWS} columns={columns} rowKey={(r) => r.id} label="States demo" renderIcon={renderIcon} />}
          loading={<SkeletonRows rows={4} columns={4} />}
          empty={<EmptyState title="No patient matches these filters" body="Clear the department filter, or search by MRN instead." renderIcon={renderIcon} action={<Button variant="primary">Clear filters</Button>} />}
          error={<ErrorState traceId="a1b2c3d4" onRetry={() => setState("ready")} renderIcon={renderIcon} />}
        />
      </Section>

      <Section title="Dialog & toast">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setDialogOpen(true)}>
            Open dialog
          </Button>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Destructive confirm
          </Button>
          <Button variant="outline" onClick={() => toast({ message: "Saved", detail: "Record updated.", tone: "success" })}>
            Success toast
          </Button>
          <Button variant="outline" onClick={() => toast({ message: "Patient removed", tone: "warning", onUndo: () => toast({ message: "Restored", tone: "info" }) })}>
            Toast with undo
          </Button>
        </div>
        <Dialog
          open={dialogOpen}
          title="Edit patient"
          tone="info"
          onClose={() => setDialogOpen(false)}
          renderIcon={renderIcon}
          isDirty={() => true}
          onRequestDiscard={() => setConfirmOpen(true)}
          actions={[{ label: "Cancel", variant: "ghost" }, { label: "Save", variant: "primary", icon: "check" }]}
        >
          <Field id="sg-dialog-name" label="Patient name" defaultValue="Ayu Lestari" help="Editing a dirty form and clicking the scrim asks before discarding." />
        </Dialog>
        <ConfirmDialog
          open={confirmOpen}
          title="Discard unsaved changes?"
          message="Closing now will lose the edits you have made."
          consequences={["The patient record will not be updated.", "You can reopen and edit again later."]}
          confirmLabel="Discard"
          onConfirm={() => {
            setConfirmOpen(false);
            setDialogOpen(false);
          }}
          onClose={() => setConfirmOpen(false)}
          renderIcon={renderIcon}
        />
      </Section>

      <Section title="Patient header">
        <PatientHeader
          patient={{ mrn: "P-001042", name: "Ayu Lestari", dob: "1987-03-14", sex: "F", nid: "3174012345678901", acuity: "urgent", status: "checked_in", allergies: ["Penicillin", "Latex"], insurer: "BPJS Kesehatan", attending: "Dr. Pratama", department: "General", balance: 1750000 }}
          ageYears={39}
          formatCurrency={(n) => `Rp ${n.toLocaleString("id-ID")}`}
          renderIcon={renderIcon}
        />
      </Section>

      <Section title="Timeline">
        <Timeline entries={TIMELINE} renderIcon={renderIcon} />
      </Section>

      <Section title="Filter chips">
        <div className="flex flex-wrap gap-2">
          {MODULES.map((m) => (
            <FilterChip
              key={m}
              label={m}
              count={ROWS.length}
              active={selectedModules.includes(m)}
              onToggle={() => setSelectedModules((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]))}
            />
          ))}
        </div>
      </Section>

      <Section title="Widget grid (drag or arrow-key reorder)">
        <WidgetGrid
          widgets={widgets}
          order={order}
          onReorder={setOrder}
          onRemove={(key) => setOrder((o) => o.filter((k) => k !== key))}
          renderIcon={renderIcon}
        />
      </Section>

      <Section title="Permission matrix">
        <PermissionMatrix draft={draft} saved={PERMISSIONS} modules={MODULES} onChange={setDraft} renderIcon={renderIcon} />
      </Section>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        renderIcon={renderIcon}
        items={[
          { id: "p1", group: "Patients", label: "Ayu Lestari", meta: "P-001042 · General", icon: "users", onRun: () => toast({ message: "Opened Ayu Lestari" }) },
          { id: "p2", group: "Patients", label: "Budi Santoso", meta: "P-001118 · Emergency", icon: "users", onRun: () => toast({ message: "Opened Budi Santoso" }) },
          { id: "a1", group: "Actions", label: "New appointment", meta: "Booking", icon: "plus", onRun: () => toast({ message: "New appointment" }) },
          { id: "g1", group: "Go to", label: "Billing", meta: "Module", icon: "receipt-text", onRun: () => toast({ message: "Billing" }) },
        ]}
      />
    </div>
  );
}

export default function StyleguideClient() {
  const { isDark, toggleTheme } = useTheme();
  const { density, toggleDensity } = useDensity();
  const [role, setRole] = React.useState<Role>("Admin");

  return (
    <ToastProvider renderIcon={renderIcon}>
      <AppShell
        title="Styleguide"
        subtitle="Design system foundation — ticket #37"
        active="dashboard"
        nav={NAV}
        session={{ name: "Dr. Ayu Pratama", role, dept: "General" }}
        permissions={PERMISSIONS}
        density={density}
        isDark={isDark}
        onToggleDensity={toggleDensity}
        onToggleTheme={toggleTheme}
        onOpenPalette={() => undefined}
        onSwitchRole={setRole}
        onSignOut={() => undefined}
        renderIcon={renderIcon}
      >
        <Catalogue density={density} toggleDensity={toggleDensity} />
      </AppShell>
    </ToastProvider>
  );
}
