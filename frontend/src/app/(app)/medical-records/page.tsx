"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  SkeletonRows,
  StateRegion,
  StatusChip,
  type Column,
  type DataState,
} from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";
import { api } from "@/lib/api/client";
import { useQuery } from "@/lib/api/queryCache";
import type { VisitNote } from "@/lib/fixtures";

type Filter = "unsigned" | "all";

/**
 * Records module landing (tickets #1, #6).
 *
 * The sidebar's Records entry needs a destination; this is the visit worklist
 * it lands on. Defaults to unsigned notes because that is the queue a clinician
 * actually works from.
 */
export default function MedicalRecordsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("unsigned");

  const visits = useQuery<{ visits: VisitNote[] }>(["visits", "worklist", filter], {
    fetcher: () =>
      api.get<{ visits: VisitNote[] }>("/medical-records/visits", {
        query: filter === "unsigned" ? { signed: false } : {},
      }),
  });

  const rows = visits.data?.visits ?? [];

  const state: DataState = visits.error
    ? "error"
    : visits.loading && !visits.data
      ? "loading"
      : rows.length === 0
        ? "empty"
        : "ready";

  const columns: Column<VisitNote>[] = [
    {
      key: "createdAt",
      label: "Date",
      mono: true,
      cell: (v) => <span className="num">{new Date(v.createdAt).toLocaleDateString()}</span>,
    },
    { key: "patient", label: "Patient", mono: true, cell: (v) => <span className="num">{v.patient}</span> },
    { key: "doctor", label: "Doctor", cell: (v) => v.doctor },
    { key: "dept", label: "Department", cell: (v) => v.dept },
    { key: "chiefComplaint", label: "Chief complaint", cell: (v) => v.chiefComplaint },
    {
      key: "status",
      label: "Status",
      cell: (v) => <StatusChip status={v.status} renderIcon={renderIcon} />,
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Records</h1>
          <p className="text-muted text-sm">Visit notes across departments.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={filter === "unsigned" ? "primary" : undefined}
            onClick={() => setFilter("unsigned")}
            data-testid="filter-unsigned"
          >
            Unsigned
          </Button>
          <Button
            variant={filter === "all" ? "primary" : undefined}
            onClick={() => setFilter("all")}
            data-testid="filter-all"
          >
            All
          </Button>
          <Button
            variant="primary"
            icon={renderIcon("file-plus", "h-4 w-4")}
            onClick={() => router.push("/medical-records/new")}
            data-testid="new-record"
          >
            New visit note
          </Button>
        </div>
      </header>

      <StateRegion
        state={state}
        loading={<SkeletonRows rows={6} columns={6} />}
        empty={
          <div className="card !p-0">
            <EmptyState
              icon="file-text"
              title={filter === "unsigned" ? "Nothing waiting to be signed" : "No visit notes yet"}
              body={
                filter === "unsigned"
                  ? "Every visit note has been signed. Switch to All to see the full record."
                  : "Visit notes appear here once a clinician records one."
              }
              renderIcon={renderIcon}
            />
          </div>
        }
        error={
          <div className="card !p-0">
            <ErrorState
              title="Could not load records"
              body={visits.error?.message ?? "The records service did not respond."}
              onRetry={visits.refetch}
              renderIcon={renderIcon}
            />
          </div>
        }
        ready={
          <div className="card overflow-hidden !p-0">
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(v) => String(v.id)}
              label="Visit notes"
              caption="Visit notes, newest first"
              rowLabel={(v) => `${v.chiefComplaint} for ${v.patient}`}
              onRowActivate={(v) => router.push(`/patients/${v.patient}/timeline`)}
              renderIcon={renderIcon}
              mobileCard={(v) => (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="num font-semibold">{v.patient}</span>
                    <StatusChip status={v.status} renderIcon={renderIcon} />
                  </div>
                  <div className="font-medium">{v.chiefComplaint}</div>
                  <div className="text-muted text-sm">
                    {v.doctor} · {v.dept}
                  </div>
                </div>
              )}
            />
          </div>
        }
      />
    </div>
  );
}
