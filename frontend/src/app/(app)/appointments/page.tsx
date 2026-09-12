"use client";

import React, { useMemo } from "react";
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
import { useQuery, queryKeys } from "@/lib/api/queryCache";
import { api } from "@/lib/api/client";
import { byDoctor, deptName } from "@/lib/fixtures";
import type { Appointment } from "@/lib/fixtures";

export default function AppointmentsPage() {
  const router = useRouter();
  const list = useQuery<{ appointments: Appointment[] }>(queryKeys.appointments(), {
    fetcher: () => api.get<{ appointments: Appointment[] }>("/appointments"),
  });

  const rows = useMemo(
    () =>
      [...(list.data?.appointments ?? [])].sort((a, b) => {
        const k = (x: Appointment) => `${x.date} ${x.time}`;
        return k(b).localeCompare(k(a));
      }),
    [list.data],
  );

  const columns: Column<Appointment>[] = [
    { key: "id", label: "ID", mono: true, cell: (a) => <span className="num font-semibold">{a.id}</span> },
    { key: "date", label: "Date", cell: (a) => <span className="num">{a.date}</span> },
    { key: "time", label: "Time", mono: true, cell: (a) => <span className="num">{a.time}</span> },
    {
      key: "patient",
      label: "Patient",
      cell: (a) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/patients/${a.patient}`);
          }}
          className="press rounded-md font-medium underline decoration-outline underline-offset-2 hover:decoration-foreground"
        >
          {a.patient}
        </button>
      ),
    },
    {
      key: "doctor",
      label: "Doctor",
      cell: (a) => <span className="text-muted">{byDoctor(a.doctor).name}</span>,
    },
    { key: "dept", label: "Department", cell: (a) => deptName(a.dept) },
    { key: "reason", label: "Reason", cell: (a) => <span className="text-muted">{a.reason}</span> },
    {
      key: "status",
      label: "Status",
      width: "8rem",
      cell: (a) => <StatusChip status={a.status} renderIcon={renderIcon} />,
    },
  ];

  const state: DataState = list.error
    ? "error"
    : list.loading && !list.data
      ? "loading"
      : rows.length === 0
        ? "empty"
        : "ready";

  return (
    <div className="space-y-4 p-4 lg:p-6" data-testid="appointments-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Appointments</h1>
          <p className="mt-1 text-base text-muted">
            {rows.length > 0 ? `${rows.length} appointments on record` : "Book the next patient visit"}
          </p>
        </div>
        <Button
          variant="primary"
          icon={renderIcon("calendar-plus", "h-4 w-4")}
          onClick={() => router.push("/appointments/new")}
          data-testid="new-appointment"
        >
          Book appointment
        </Button>
      </header>

      <StateRegion
        state={state}
        loading={<SkeletonRows rows={7} columns={6} />}
        empty={
          <div className="card !p-0">
            <EmptyState
              icon="calendar-x"
              title="No appointments yet"
              body="Book the first appointment to build the day's schedule."
              action={
                <Button variant="primary" onClick={() => router.push("/appointments/new")}>
                  Book an appointment
                </Button>
              }
              renderIcon={renderIcon}
            />
          </div>
        }
        error={
          <div className="card !p-0">
            <ErrorState
              title="Could not load appointments"
              body={list.error?.message ?? "The appointment service did not respond."}
              onRetry={list.refetch}
              renderIcon={renderIcon}
            />
          </div>
        }
        ready={
          <div className="card overflow-hidden !p-0">
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(a) => a.id}
              label="Appointments"
              caption="All recorded appointments, newest first"
              rowLabel={(a) => `${a.id} — ${a.patient} at ${a.time}`}
              initialSort={{ key: "date", dir: "desc" }}
              renderIcon={renderIcon}
              mobileCard={(a) => (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num font-semibold">{a.id}</span>
                  <span className="num text-muted">{a.date} {a.time}</span>
                  <span className="flex-1 text-muted">{a.reason}</span>
                  <StatusChip status={a.status} renderIcon={renderIcon} />
                </div>
              )}
            />
          </div>
        }
      />
    </div>
  );
}