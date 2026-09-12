"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AcuityBadge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  FilterChip,
  SkeletonRows,
  StateRegion,
  StatusChip,
  type Column,
  type DataState,
} from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";
import { useQuery, queryKeys } from "@/lib/api/queryCache";
import { api } from "@/lib/api/client";
import { byDoctor, deptName } from "@/lib/fixtures";
import type { ApiDepartment, Patient } from "@/lib/fixtures";

const PAGE_SIZE = 20;

interface PatientsResponse {
  patients: Patient[];
  total: number;
  page: number;
  page_size: number;
}

const ACUITY_OPTIONS = [
  { label: "Critical", value: "critical" },
  { label: "Urgent", value: "urgent" },
  { label: "Standard", value: "standard" },
  { label: "Routine", value: "routine" },
];

const STATUS_OPTIONS = [
  { label: "Admitted", value: "admitted" },
  { label: "Outpatient", value: "outpatient" },
  { label: "Discharged", value: "discharged" },
];

export default function PatientsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [acuity, setAcuity] = useState<string | null>(null);
  const [admissionStatus, setAdmissionStatus] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(null);

  // Debounce the search query by 300ms (design system).
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const depts = useQuery<{ departments: ApiDepartment[] }>(queryKeys.departments(), {
    fetcher: () => api.get<{ departments: ApiDepartment[] }>("/admin/departments"),
  });

  const list = useQuery<PatientsResponse>(
    queryKeys.patients({
      q: debouncedQ,
      page,
      page_size: PAGE_SIZE,
      acuity: acuity ?? undefined,
      admission_status: admissionStatus ?? undefined,
      department: department ?? undefined,
    }),
    {
      fetcher: () =>
        api.get<PatientsResponse>("/patients", {
          query: {
            q: debouncedQ || undefined,
            page,
            page_size: PAGE_SIZE,
            acuity: acuity ?? undefined,
            admission_status: admissionStatus ?? undefined,
            department: department ?? undefined,
          },
        }),
    },
  );

  const deptOptions = useMemo(
    () =>
      (depts.data?.departments ?? []).map((d) => ({
        label: `${d.code} — ${d.name}`,
        value: d.code,
      })),
    [depts.data],
  );

  const activeFilterCount = [acuity, admissionStatus, department].filter(Boolean).length;

  const columns: Column<Patient>[] = useMemo(
    () => [
      { key: "mrn", label: "MRN", mono: true, cell: (p) => <span className="num font-semibold">{p.mrn}</span> },
      { key: "name", label: "Name", cell: (p) => p.name },
      { key: "dob", label: "DOB", cell: (p) => <span className="num">{p.dob}</span> },
      { key: "sex", label: "Sex", width: "5rem", cell: (p) => (p.sex === "F" ? "Female" : "Male") },
      {
        key: "acuity",
        label: "Acuity",
        width: "7rem",
        sortValue: (p) => p.acuity,
        cell: (p) => <AcuityBadge acuity={p.acuity} renderIcon={renderIcon} />,
      },
      {
        key: "admission_status",
        label: "Status",
        width: "8rem",
        sortValue: (p) => p.status,
        cell: (p) => <StatusChip status={p.status} renderIcon={renderIcon} />,
      },
      {
        key: "department",
        label: "Department",
        cell: (p) => (
          <span className="inline-flex items-center gap-1">
            {renderIcon("building-2", "h-3.5 w-3.5 text-muted")}
            {deptName(p.dept)}
          </span>
        ),
      },
      {
        key: "primary_doctor",
        label: "Primary doctor",
        cell: (p) => <span className="text-muted">{byDoctor(p.doctor).name}</span>,
      },
    ],
    [],
  );

  const patients = list.data?.patients ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const state: DataState = list.error
    ? "error"
    : list.loading && !list.data
      ? "loading"
      : patients.length === 0
        ? "empty"
        : "ready";

  const clearFilters = useCallback(() => {
    setAcuity(null);
    setAdmissionStatus(null);
    setDepartment(null);
    setQ("");
  }, []);

  return (
    <div className="space-y-4 p-4 lg:p-6" data-testid="patients-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Patients</h1>
          <p className="mt-1 text-base text-muted">
            {total > 0 ? `${total.toLocaleString()} patients across the hospital` : "Find a patient by name or MRN"}
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-56 flex-1 sm:max-w-xs">
          <Field
            id="patient-search"
            label="Search"
            type="search"
            icon="search"
            value={q}
            onChange={setQ}
            placeholder="Name or MRN…"
            renderIcon={renderIcon}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter patients">
          <span className="text-2xs font-semibold uppercase tracking-wide text-subtle">Acuity</span>
          {ACUITY_OPTIONS.map((o) => (
            <FilterChip
              key={o.value}
              label={o.label}
              active={acuity === o.value}
              onToggle={() => setAcuity((c) => (c === o.value ? null : o.value))}
            />
          ))}
          <span className="ml-2 text-2xs font-semibold uppercase tracking-wide text-subtle">Status</span>
          {STATUS_OPTIONS.map((o) => (
            <FilterChip
              key={o.value}
              label={o.label}
              active={admissionStatus === o.value}
              onToggle={() => setAdmissionStatus((c) => (c === o.value ? null : o.value))}
            />
          ))}
        </div>
        {deptOptions.length > 0 ? (
          <div className="w-56">
            <Field
              id="patient-dept-filter"
              label="Department"
              type="select"
              options={[{ label: "All departments", value: "" }, ...deptOptions]}
              value={department ?? ""}
              onChange={(v) => {
                setDepartment(v || null);
                setPage(1);
              }}
              renderIcon={renderIcon}
            />
          </div>
        ) : null}
        {activeFilterCount > 0 ? (
          <Button
            variant="ghost"
            icon={renderIcon("x", "h-4 w-4")}
            onClick={clearFilters}
            data-testid="clear-filters"
          >
            Clear filters ({activeFilterCount})
          </Button>
        ) : null}
      </div>

      <StateRegion
        state={state}
        loading={<SkeletonRows rows={8} columns={5} />}
        empty={
          <div className="card !p-0">
            <EmptyState
              icon="users"
              title={debouncedQ ? `No patient matches "${debouncedQ}"` : "No patients here yet"}
              body={
                activeFilterCount > 0
                  ? "The active filters are too narrow — clear them to widen the list."
                  : "Register the first patient to start building the census."
              }
              action={
                activeFilterCount > 0 ? (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
              renderIcon={renderIcon}
            />
          </div>
        }
        error={
          <div className="card !p-0">
            <ErrorState
              title="Could not load patients"
              body={list.error?.message ?? "The patient directory did not respond."}
              onRetry={list.refetch}
              renderIcon={renderIcon}
            />
          </div>
        }
        ready={
          <div className="card overflow-hidden !p-0">
            <DataTable
              rows={patients}
              columns={columns}
              rowKey={(p) => p.mrn}
              label="Patients"
              caption={`${total} patients; page ${page} of ${totalPages}`}
              rowLabel={(p) => `${p.name} (${p.mrn})`}
              onRowActivate={(p) => router.push(`/patients/${p.mrn}`)}
              mobileCard={(p) => (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num font-semibold">{p.mrn}</span>
                  <span className="flex-1 font-medium">{p.name}</span>
                  <AcuityBadge acuity={p.acuity} renderIcon={renderIcon} />
                </div>
              )}
              renderIcon={renderIcon}
              footer={
                <nav className="flex flex-wrap items-center gap-2" aria-label="Patient list pagination">
                  <span className="num">
                    {total} result{total === 1 ? "" : "s"} · page {page} of {totalPages}
                  </span>
                  <span className="flex-1" />
                  <Button
                    variant="subtle"
                    size="sm"
                    icon={renderIcon("chevron-left", "h-4 w-4")}
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="subtle"
                    size="sm"
                    iconRight={renderIcon("chevron-right", "h-4 w-4")}
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </nav>
              }
            />
          </div>
        }
      />
    </div>
  );
}