"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  EmptyState,
  ErrorState,
  PatientHeader,
  SkeletonRows,
  StateRegion,
  StatusChip,
  Timeline,
  type DataState,
} from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";
import { useQuery, queryKeys } from "@/lib/api/queryCache";
import { api } from "@/lib/api/client";
import { byDoctor, deptName, rp } from "@/lib/fixtures";
import type {
  ClinicalSummary,
  HistoryEvent,
  Invoice,
  Patient,
  VisitNote,
} from "@/lib/fixtures";

type TabId = "overview" | "timeline" | "records" | "prescriptions" | "billing";

type PrescriptionRow = VisitNote["prescriptions"][number] & { visitDate?: string; status?: VisitNote["status"] };

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "clipboard-list" },
  { id: "timeline", label: "Timeline", icon: "history" },
  { id: "records", label: "Records", icon: "file-text" },
  { id: "prescriptions", label: "Prescriptions", icon: "pill" },
  { id: "billing", label: "Billing", icon: "receipt-text" },
];

function TabBar({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <div
      className="flex flex-wrap items-center gap-1 rounded-xl border border-outline bg-surface-1 p-1"
      role="tablist"
      aria-label="Patient record sections"
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`press inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-base font-medium ${
            active === t.id
              ? "bg-primary text-primary-foreground"
              : "text-muted hover:bg-surface-3 hover:text-foreground"
          }`}
        >
          {renderIcon(t.icon, "h-4 w-4")}
          {t.label}
        </button>
      ))}
    </div>
  );
}

const TONE_BY_SEVERITY: Record<string, string> = {
  severe: "bg-danger-container text-danger-container-foreground",
  moderate: "bg-warning-container text-warning-container-foreground",
  mild: "bg-info-container text-info-container-foreground",
};

function severityLabel(severity: string): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function formatHistoryTime(iso: string | null): string {
  if (!iso) return "—";
  const s = iso.slice(0, 16).replace("T", " ");
  return s;
}

export default function PatientDetailPage({ params }: { params: { mrn: string } }) {
  const { mrn } = params;
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("overview");

  const patientQuery = useQuery<Patient>(queryKeys.patient(mrn), {
    fetcher: () => api.get<Patient>(`/patients/${mrn}`),
  });
  const summaryQuery = useQuery<ClinicalSummary>(["patients", mrn, "clinical-summary"], {
    fetcher: () => api.get<ClinicalSummary>(`/patients/${mrn}/clinical-summary`),
  });
  const timelineQuery = useQuery<{ events: HistoryEvent[] }>(queryKeys.patientTimeline(mrn), {
    fetcher: () => api.get<{ events: HistoryEvent[] }>(`/medical-records/patients/${mrn}/history`),
    enabled: tab === "timeline",
  });
  const visitsQuery = useQuery<{ visits: VisitNote[] }>(queryKeys.visits(mrn), {
    fetcher: () => api.get<{ visits: VisitNote[] }>(`/medical-records/${mrn}/visits`),
    enabled: tab === "records",
  });
  type PrescriptionRow = VisitNote["prescriptions"][number] & { visitDate?: string; status?: VisitNote["status"] };
  const rxQuery = useQuery<{ prescriptions: PrescriptionRow[] }>(
    ["patients", mrn, "prescriptions"],
    {
      fetcher: () => api.get<{ prescriptions: PrescriptionRow[] }>(`/patients/${mrn}/prescriptions`),
      enabled: tab === "prescriptions",
    },
  );
  const invoicesQuery = useQuery<{ invoices: Invoice[] }>(queryKeys.invoices({ patient: mrn }), {
    fetcher: () => api.get<{ invoices: Invoice[] }>("/invoices", { query: { patient: mrn } }),
    enabled: tab === "billing",
  });

  const patient = patientQuery.data;
  const summary = summaryQuery.data;

  const timelineEntries = useMemo(() => {
    const events = timelineQuery.data?.events ?? [];
    const kindMap: Record<string, "note" | "vitals" | "prescription"> = {
      visit: "note",
      vitals: "vitals",
      prescription: "prescription",
      care_plan: "note",
      billing: "note",
      attachment: "note",
    };
    return events.map((e, i) => ({
      id: `${e.type}-${String(e.source_id)}-${i}`,
      at: formatHistoryTime(e.timestamp),
      kind: kindMap[e.type] ?? "note",
      department: e.department_code ?? "—",
      departmentName: e.department_code ? deptName(e.department_code) : "Hospital",
      author: e.type === "vitals" ? "Nursing" : e.type === "visit" ? "Clinical staff" : "System",
      title: e.summary,
      body: e.type === "visit" && !e.signed ? "Visit note not yet signed." : e.signed ? "Signed visit note." : "",
      flagged: false,
    }));
  }, [timelineQuery.data]);

  const state: DataState = patientQuery.error
    ? "error"
    : patientQuery.loading && !patient
      ? "loading"
      : !patient
        ? "loading"
        : "ready";

  const openBilling = useCallback(() => setTab("billing"), []);

  return (
    <div className="space-y-4 p-4 lg:p-6" data-testid="patient-detail">
      <StateRegion
        state={state}
        loading={<SkeletonRows rows={4} columns={4} />}
        empty={
          <EmptyState
            icon="user-x"
            title={`No record for ${mrn}`}
            body="This patient could not be found in the directory."
            renderIcon={renderIcon}
          />
        }
        error={
          <ErrorState
            title="Could not load patient"
            body={patientQuery.error?.message ?? `No patient record for ${mrn}.`}
            onRetry={patientQuery.refetch}
            renderIcon={renderIcon}
          />
        }
        ready={
          patient ? (
            <>
              <PatientHeader
                patient={{
                  mrn: patient.mrn,
                  name: patient.name,
                  dob: patient.dob,
                  sex: patient.sex,
                  nid: patient.nid,
                  acuity: patient.acuity,
                  status: patient.status,
                  allergies: patient.allergies,
                  insurer: patient.insurer,
                  attending: byDoctor(patient.doctor).name,
                  department: deptName(patient.dept),
                  balance: patient.balance,
                }}
                ageYears={Math.max(0, new Date().getFullYear() - Number(patient.dob.slice(0, 4)))}
                formatCurrency={rp}
                onOpenBilling={openBilling}
                actions={
                  <Button
                    variant="outline"
                    icon={renderIcon("calendar-plus", "h-4 w-4")}
                    onClick={() => router.push("/appointments/new")}
                  >
                    Book appointment
                  </Button>
                }
                renderIcon={renderIcon}
              />

            <TabBar active={tab} onChange={setTab} />

            {tab === "overview" ? <OverviewTab summary={summary} patient={patient} onRetry={summaryQuery.refetch} summaryState={summaryQuery.error ? "error" : summaryQuery.loading && !summary ? "loading" : summary ? "ready" : "loading"} /> : null}
            {tab === "timeline" ? (
              <StateRegion
                state={timelineQuery.error ? "error" : timelineQuery.loading && !timelineQuery.data ? "loading" : (timelineQuery.data?.events.length ?? 0) === 0 ? "empty" : "ready"}
                loading={<SkeletonRows rows={5} columns={2} />}
                empty={
                  <div className="card !p-0">
                    <EmptyState
                      icon="history"
                      title="No clinical history yet"
                      body="Visits, vitals, prescriptions and invoices will appear here in chronological order."
                      renderIcon={renderIcon}
                    />
                  </div>
                }
                error={
                  <div className="card !p-0">
                    <ErrorState
                      title="Could not load timeline"
                      body={timelineQuery.error?.message ?? "The history feed did not respond."}
                      onRetry={timelineQuery.refetch}
                      renderIcon={renderIcon}
                    />
                  </div>
                }
                ready={
                  <div className="card !p-4">
                    <h2 className="mb-4 text-base font-semibold">Clinical history</h2>
                    <Timeline entries={timelineEntries} renderIcon={renderIcon} />
                  </div>
                }
              />
            ) : null}
            {tab === "records" ? (
              <RecordsTab query={visitsQuery} onRetry={visitsQuery.refetch} />
            ) : null}
            {tab === "prescriptions" ? (
              <PrescriptionsTab query={rxQuery} onRetry={rxQuery.refetch} />
            ) : null}
            {tab === "billing" ? (
              <BillingTab query={invoicesQuery} onRetry={invoicesQuery.refetch} onOpen={(id) => router.push(`/billing/invoices/${id}`)} />
            ) : null}
            </>
          ) : null
        }
      />
    </div>
  );
}

function OverviewTab({
  summary,
  patient,
  onRetry,
  summaryState,
}: {
  summary: ClinicalSummary | undefined;
  patient: Patient;
  onRetry: () => void;
  summaryState: DataState;
}) {
  const allergies = summary?.allergies ?? [];
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="card !p-4" aria-label="Clinical summary">
        <StateRegion
          state={summaryState}
          loading={<SkeletonRows rows={4} columns={2} />}
          empty={
            <EmptyState
              icon="clipboard-list"
              title="No summary data"
              body="The clinical summary is empty for this patient."
              renderIcon={renderIcon}
            />
          }
          error={
            <ErrorState
              title="Could not load clinical summary"
              body="The summary endpoint did not respond."
              onRetry={onRetry}
              renderIcon={renderIcon}
            />
          }
          ready={
            <>
              <h2 className="mb-3 text-base font-semibold">Clinical summary</h2>
              <dl className="grid grid-cols-2 gap-x-5 gap-y-3">
                <div>
                  <dt className="text-2xs font-semibold uppercase tracking-wide text-subtle">Acuity</dt>
                  <dd className="mt-0.5 text-base">{summary ? summary.acuity : patient.acuity}</dd>
                </div>
                <div>
                  <dt className="text-2xs font-semibold uppercase tracking-wide text-subtle">Status</dt>
                  <dd className="mt-0.5">
                    <StatusChip status={patient.status} renderIcon={renderIcon} />
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs font-semibold uppercase tracking-wide text-subtle">Active prescriptions</dt>
                  <dd className="num mt-0.5 text-base">{summary?.active_prescriptions_count ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-2xs font-semibold uppercase tracking-wide text-subtle">Active appointments</dt>
                  <dd className="num mt-0.5 text-base">{summary?.active_appointments_count ?? 0}</dd>
                </div>
              </dl>
            </>
          }
        />
      </section>

      <section className="card !p-4" aria-label="Contact information">
        <h2 className="mb-3 text-base font-semibold">Contact information</h2>
        <dl className="space-y-2">
          <div className="flex items-center gap-2">
            {renderIcon("phone", "h-4 w-4 text-muted")}
            <dt className="sr-only">Phone</dt>
            <dd className="num">{patient.phone}</dd>
          </div>
          <div className="flex items-center gap-2">
            {renderIcon("credit-card", "h-4 w-4 text-muted")}
            <dt className="sr-only">National ID</dt>
            <dd className="num">{patient.nid}</dd>
          </div>
          <div className="flex items-center gap-2">
            {renderIcon("shield", "h-4 w-4 text-muted")}
            <dt className="sr-only">Insurer</dt>
            <dd>{patient.insurer}</dd>
          </div>
          <div className="flex items-center gap-2">
            {renderIcon("user", "h-4 w-4 text-muted")}
            <dt className="sr-only">Primary doctor</dt>
            <dd>{byDoctor(patient.doctor).name}</dd>
          </div>
        </dl>
      </section>

      <section className="card !p-4 lg:col-span-2" aria-label="Allergies">
        <h2 className="mb-3 text-base font-semibold">Allergies</h2>
        {allergies.length === 0 ? (
          <p className="text-base text-muted">No known allergies on record.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {allergies.map((a) => (
              <li
                key={a.substance}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${TONE_BY_SEVERITY[a.severity] ?? "bg-surface-3 text-foreground"}`}
              >
                {renderIcon("alert-circle", "h-3 w-3")}
                {a.substance}
                <span className="opacity-80">· {severityLabel(a.severity)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

interface SimpleQuery<T> {
  data?: T;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

function RecordsTab({ query, onRetry }: { query: SimpleQuery<{ visits: VisitNote[] }>; onRetry: () => void }) {
  const visits = query.data?.visits ?? [];
  const state: DataState = query.error ? "error" : query.loading && !query.data ? "loading" : visits.length === 0 ? "empty" : "ready";
  return (
    <StateRegion
      state={state}
      loading={<SkeletonRows rows={5} columns={3} />}
      empty={
        <div className="card !p-0">
          <EmptyState
            icon="file-text"
            title="No visit notes"
            body="When this patient is seen, visit notes will be listed here."
            renderIcon={renderIcon}
          />
        </div>
      }
      error={
        <div className="card !p-0">
          <ErrorState title="Could not load visit notes" body={query.error?.message ?? "The records feed did not respond."} onRetry={onRetry} renderIcon={renderIcon} />
        </div>
      }
      ready={
        <div className="card divide-y divide-outline !p-0">
          {visits.map((v) => (
            <article key={v.id} className="flex flex-wrap items-start gap-3 p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-container text-primary-container-foreground">
                {renderIcon("file-text", "h-4 w-4")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold">{v.diagnosis || v.chiefComplaint}</h3>
                  <StatusChip status={v.status} renderIcon={renderIcon} />
                </div>
                <p className="mt-1 text-base leading-relaxed text-muted">{v.clinicalNotes || v.chiefComplaint}</p>
                <p className="num mt-1.5 text-2xs text-subtle">
                  {byDoctor(v.doctor).name} · {deptName(v.dept)} · {v.createdAt.slice(0, 10)}
                </p>
              </div>
              {v.prescriptions.length > 0 ? (
                <span className="num rounded-full bg-surface-3 px-2 py-0.5 text-2xs font-semibold text-muted">
                  {v.prescriptions.length} Rx
                </span>
              ) : null}
            </article>
          ))}
        </div>
      }
    />
  );
}

function PrescriptionsTab({
  query,
  onRetry,
}: {
  query: SimpleQuery<{ prescriptions: PrescriptionRow[] }>;
  onRetry: () => void;
}) {
  const rx = query.data?.prescriptions ?? [];
  const state: DataState = query.error ? "error" : query.loading && !query.data ? "loading" : rx.length === 0 ? "empty" : "ready";
  return (
    <StateRegion
      state={state}
      loading={<SkeletonRows rows={4} columns={3} />}
      empty={
        <div className="card !p-0">
          <EmptyState
            icon="pill"
            title="No active prescriptions"
            body="Prescriptions written at any visit will appear here."
            renderIcon={renderIcon}
          />
        </div>
      }
      error={
        <div className="card !p-0">
          <ErrorState title="Could not load prescriptions" body={query.error?.message ?? "The prescriptions feed did not respond."} onRetry={onRetry} renderIcon={renderIcon} />
        </div>
      }
      ready={
        <div className="card divide-y divide-outline !p-0">
          {rx.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-warning-container text-warning-container-foreground">
                {renderIcon("pill", "h-4 w-4")}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold">{r.medication}</h3>
                <p className="text-sm text-muted">
                  {r.dosage} · {r.frequency} · {r.durationDays} days
                </p>
              </div>
              <StatusChip
                status={r.status as VisitNote["status"]}
                renderIcon={renderIcon}
                label={r.status === "signed" ? "Active" : "Pending"}
              />
            </div>
          ))}
        </div>
      }
    />
  );
}

function BillingTab({
  query,
  onRetry,
  onOpen,
}: {
  query: SimpleQuery<{ invoices: Invoice[] }>;
  onRetry: () => void;
  onOpen: (id: string) => void;
}) {
  const invoices = query.data?.invoices ?? [];
  const state: DataState = query.error ? "error" : query.loading && !query.data ? "loading" : invoices.length === 0 ? "empty" : "ready";
  return (
    <StateRegion
      state={state}
      loading={<SkeletonRows rows={4} columns={4} />}
      empty={
        <div className="card !p-0">
          <EmptyState
            icon="receipt-text"
            title="No invoices"
            body="This patient has no invoices yet."
            renderIcon={renderIcon}
          />
        </div>
      }
      error={
        <div className="card !p-0">
          <ErrorState title="Could not load invoices" body={query.error?.message ?? "The billing feed did not respond."} onRetry={onRetry} renderIcon={renderIcon} />
        </div>
      }
      ready={
        <div className="card divide-y divide-outline !p-0">
          {invoices.map((inv) => {
            const statusKey = inv.status === "void" ? "cancelled" : inv.status === "draft" ? "draft" : inv.status;
            return (
              <button
                key={inv.id}
                type="button"
                onClick={() => onOpen(inv.id)}
                className="flex w-full min-h-12 flex-wrap items-center gap-3 p-4 text-left press hover:bg-surface-2"
              >
                <span className="num font-semibold">{inv.id}</span>
                <span className="flex-1 text-base text-muted">{inv.date}</span>
                <StatusChip status={statusKey} label={inv.status === "void" ? "Void" : undefined} renderIcon={renderIcon} />
                <span className="num text-base font-semibold">{rp(inv.total)}</span>
                <span className="text-subtle">{renderIcon("chevron-right", "h-4 w-4")}</span>
              </button>
            );
          })}
        </div>
      }
    />
  );
}