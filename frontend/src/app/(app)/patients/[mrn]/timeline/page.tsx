"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  EmptyState,
  ENTRY_KIND,
  ErrorState,
  Field,
  FilterChip,
  SkeletonRows,
  StateRegion,
  Timeline,
  type DataState,
  type EntryKind,
  type TimelineEntry,
} from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";
import { api } from "@/lib/api/client";
import { useQuery, queryKeys } from "@/lib/api/queryCache";
import { byDoctor, deptName } from "@/lib/fixtures";
import type { HistoryEvent, VisitNote } from "@/lib/fixtures";

const KIND_MAP: Record<HistoryEvent["type"], EntryKind> = {
  visit: "note",
  prescription: "prescription",
  attachment: "attachment",
  vitals: "vitals",
  care_plan: "care_plan",
  billing: "billing",
};

const TYPE_OPTIONS: HistoryEvent["type"][] = [
  "visit",
  "prescription",
  "attachment",
  "vitals",
  "care_plan",
  "billing",
];

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

function dayOnly(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

function authorFor(e: HistoryEvent): string {
  switch (e.type) {
    case "vitals":
      return "Nursing";
    case "visit":
      return "Clinical staff";
    case "billing":
      return "Billing";
    default:
      return "System";
  }
}

function bodyFor(e: HistoryEvent): string {
  switch (e.type) {
    case "visit":
      return e.signed ? "Signed visit note." : "Visit note not yet signed.";
    case "prescription":
      return "Prescription attached to a visit.";
    case "attachment":
      return "Attachment on file.";
    case "billing":
      return "Invoice recorded for this patient.";
    case "care_plan":
      return "Care plan item on file.";
    case "vitals":
      return "Vitals reading recorded.";
    default:
      return e.summary;
  }
}

function toTimelineEntry(e: HistoryEvent, i: number): TimelineEntry {
  return {
    id: `${e.type}-${String(e.source_id)}-${i}`,
    at: formatTime(e.timestamp),
    kind: KIND_MAP[e.type],
    department: e.department_code ?? "__unknown__",
    departmentName: e.department_code ? deptName(e.department_code) : "Unknown department",
    author: authorFor(e),
    title: e.summary,
    body: bodyFor(e),
  };
}

export default function PatientTimelinePage({ params }: { params: { mrn: string } }) {
  const { mrn } = params;
  const router = useRouter();

  const [order, setOrder] = useState<"desc" | "asc">("desc");
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set());
  const [deptFilters, setDeptFilters] = useState<Set<string>>(new Set());
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [source, setSource] = useState<HistoryEvent | null>(null);

  const history = useQuery<{ patient_id: string; events: HistoryEvent[] }>(
    queryKeys.patientTimeline(mrn),
    {
      fetcher: () => api.get<{ patient_id: string; events: HistoryEvent[] }>(`/medical-records/patients/${mrn}/history`),
    },
  );

  const events = history.data?.events ?? [];

  const toggleSet = (set: Set<string>, value: string, update: (next: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    update(next);
  };

  const departmentOptions = useMemo(() => {
    const codes = [...new Set(events.map((e) => e.department_code).filter((c): c is string => Boolean(c)))];
    return codes.sort();
  }, [events]);

  const dated = useMemo(() => {
    let list = events.filter((e) => e.timestamp);
    if (fromDate) list = list.filter((e) => (dayOnly(e.timestamp) ?? "") >= fromDate);
    if (toDate) list = list.filter((e) => (dayOnly(e.timestamp) ?? "") <= toDate);
    list.sort((a, b) => {
      const cmp = String(a.timestamp ?? "").localeCompare(String(b.timestamp ?? ""));
      return order === "desc" ? -cmp : cmp;
    });
    return list;
  }, [events, fromDate, toDate, order]);

  const undated = useMemo(() => events.filter((e) => !e.timestamp), [events]);
  const undatedEntries = useMemo(() => undated.map(toTimelineEntry), [undated]);

  const datedEntries = useMemo(() => dated.map(toTimelineEntry), [dated]);

  const hasActiveFilters = typeFilters.size > 0 || deptFilters.size > 0 || Boolean(fromDate || toDate);
  const datedVisible = datedEntries.filter((e) => {
    if (typeFilters.size && !typeFilters.has(e.kind)) return false;
    if (deptFilters.size && !deptFilters.has(e.department)) return false;
    return true;
  });
  const undatedVisible = undatedEntries.filter((e) => {
    if (typeFilters.size && !typeFilters.has(e.kind)) return false;
    if (deptFilters.size && !deptFilters.has(e.department)) return false;
    return true;
  });

  const state: DataState = history.error
    ? "error"
    : history.loading && !history.data
      ? "loading"
      : events.length === 0
        ? "empty"
        : "ready";

  const visitQuery = useQuery<{ visit: VisitNote }>(queryKeys.visit(String(source?.source_id ?? "")), {
    fetcher: () => api.get<{ visit: VisitNote }>(`/medical-records/visits/${String(source?.source_id ?? "")}`),
    enabled: source?.type === "visit" && Boolean(source?.source_id),
  });

  const sourceKind = source ? KIND_MAP[source.type] : "note";
  const sourceMeta = source ? ENTRY_KIND[sourceKind] : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 lg:p-6" data-testid="patient-timeline">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Patient timeline</h1>
          <p className="mt-1 text-base text-muted">
            {mrn} — aggregated across departments
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-outline bg-surface-0 p-0.5" role="group" aria-label="Timeline order">
          <Button variant="ghost" size="sm" onClick={() => setOrder("desc")} className={order === "desc" ? "bg-surface-3" : ""}>
            Newest first
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOrder("asc")} className={order === "asc" ? "bg-surface-3" : ""}>
            Oldest first
          </Button>
        </div>
      </header>

      <StateRegion
        state={state}
        loading={<SkeletonRows rows={7} columns={2} />}
        empty={
          <div className="card">
            <EmptyState
              icon="history"
              title="No clinical history yet"
              body="Visits, prescriptions, attachments, vitals, care plans and billing will appear here once they exist for this patient."
              renderIcon={renderIcon}
            />
          </div>
        }
        error={
          <div className="card">
            <ErrorState
              title="Could not load the timeline"
              body={history.error?.message ?? "The history feed did not respond."}
              onRetry={history.refetch}
              renderIcon={renderIcon}
            />
          </div>
        }
        ready={
          <>
            {/* Filters */}
            <div className="card space-y-4 !p-4">
              <section aria-label="Filter by type">
                <h2 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Type</h2>
                <div className="flex flex-wrap gap-2">
                  {TYPE_OPTIONS.map((t) => {
                    const kind = KIND_MAP[t];
                    const count = events.filter((e) => e.type === t).length;
                    return (
                      <FilterChip
                        key={t}
                        label={ENTRY_KIND[kind].label}
                        count={count}
                        active={typeFilters.has(kind)}
                        onToggle={() => toggleSet(typeFilters, kind, setTypeFilters)}
                      />
                    );
                  })}
                </div>
              </section>

              <section aria-label="Filter by department">
                <h2 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Department</h2>
                <div className="flex flex-wrap gap-2">
                  {departmentOptions.length === 0 ? (
                    <p className="text-sm text-muted">No department metadata on record.</p>
                  ) : (
                    departmentOptions.map((d) => {
                      const count = events.filter((e) => e.department_code === d).length;
                      return (
                        <FilterChip
                          key={d}
                          label={deptName(d)}
                          count={count}
                          active={deptFilters.has(d)}
                          onToggle={() => toggleSet(deptFilters, d, setDeptFilters)}
                        />
                      );
                    })
                  )}
                </div>
              </section>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="tl-from" label="From" type="date" value={fromDate} onChange={setFromDate} renderIcon={renderIcon} />
                <Field id="tl-to" label="To" type="date" value={toDate} onChange={setToDate} renderIcon={renderIcon} />
              </div>

              {hasActiveFilters ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline pt-3">
                  <p className="text-sm text-muted">
                    {datedVisible.length + undatedVisible.length} of {events.length} events shown
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={renderIcon("x", "h-4 w-4")}
                    onClick={() => {
                      setTypeFilters(new Set());
                      setDeptFilters(new Set());
                      setFromDate("");
                      setToDate("");
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : null}
            </div>

            {/* Timeline */}
            {datedVisible.length + undatedVisible.length === 0 ? (
              <div className="card">
                <EmptyState
                  icon="filter-x"
                  title="No events match these filters"
                  body="Adjust the type, department or date-range filters to widen the view."
                  renderIcon={renderIcon}
                />
              </div>
            ) : (
              <div className="card space-y-6 !p-4">
                <section aria-label="Timeline events">
                  {datedVisible.length > 0 ? (
                    <Timeline
                      entries={datedVisible}
                      renderIcon={renderIcon}
                      entryAction={(e) => (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={renderIcon("external-link", "h-3.5 w-3.5")}
                          onClick={() => setSource(findEvent(e.id))}
                          data-testid={`view-source-${e.id}`}
                        >
                          View source
                        </Button>
                      )}
                    />
                  ) : (
                    <p className="text-sm text-muted">No dated events match.</p>
                  )}
                </section>

                {undatedVisible.length > 0 ? (
                  <section aria-label="Undated events">
                    <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
                      {renderIcon("clock-alert", "h-4 w-4 text-muted")}
                      Undated
                      <span className="num rounded-full bg-surface-3 px-1.5 py-0.5 text-2xs text-muted">
                        {undatedVisible.length}
                      </span>
                    </h2>
                    <Timeline
                      entries={undatedVisible}
                      renderIcon={renderIcon}
                      entryAction={(e) => (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={renderIcon("external-link", "h-3.5 w-3.5")}
                          onClick={() => setSource(findEvent(e.id))}
                        >
                          View source
                        </Button>
                      )}
                    />
                  </section>
                ) : null}
              </div>
            )}
          </>
        }
      />

      {/* Source detail */}
      <Dialog
        open={source !== null}
        title={source ? source.summary : "Source record"}
        size="md"
        onClose={() => setSource(null)}
        renderIcon={renderIcon}
      >
        {source ? (
          <div className="space-y-4" data-testid="source-panel">
            {sourceMeta ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 text-sm font-semibold">
                  {renderIcon(sourceMeta.icon, "h-3.5 w-3.5")}
                  {sourceMeta.label}
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg bg-info-container px-2.5 py-1 text-sm font-semibold text-info-container-foreground">
                  {renderIcon("building-2", "h-3.5 w-3.5")}
                  {source.department_code ? deptName(source.department_code) : "Unknown department"}
                </span>
                <span className="num text-sm text-muted">{formatTime(source.timestamp)}</span>
              </div>
            ) : null}

            {source.type === "visit" ? (
              <div>
                <p className="text-base text-muted">
                  {visitQuery.loading ? (
                    "Loading the full visit note…"
                  ) : visitQuery.error ? (
                    "Could not load the full visit note."
                  ) : visitQuery.data ? (
                    <>
                      <span className="block font-medium text-foreground">
                        Diagnosis: {visitQuery.data.visit.diagnosis}
                      </span>
                      <span className="block">
                        Chief complaint: {visitQuery.data.visit.chiefComplaint}
                      </span>
                      <span className="block">
                        {visitQuery.data.visit.clinicalNotes || "No clinical notes."}
                      </span>
                      <span className="mt-1 block text-sm text-muted">
                        {visitQuery.data.visit.prescriptions.length} prescription
                        {visitQuery.data.visit.prescriptions.length === 1 ? "" : "s"} · by{" "}
                        {byDoctor(visitQuery.data.visit.doctor).name}
                      </span>
                    </>
                  ) : (
                    "No details available."
                  )}
                </p>
              </div>
            ) : (
              <p className="text-base leading-relaxed text-muted">{bodyFor(source)}</p>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-outline pt-3">
              <Button
                variant="outline"
                icon={renderIcon("file-text", "h-4 w-4")}
                onClick={() => router.push(`/patients/${mrn}`)}
              >
                Open patient record
              </Button>
              <Button variant="primary" onClick={() => setSource(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );

  function findEvent(id: string): HistoryEvent | null {
    return (
      [...dated, ...undated].find(
        (e) => id.startsWith(`${e.type}-${String(e.source_id)}`),
      ) ?? null
    );
  }
}