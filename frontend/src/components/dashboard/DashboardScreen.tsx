"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Meter,
  SkeletonRows,
  StateRegion,
  StatusChip,
  WidgetGrid,
  type DataState,
  type WidgetDefinition,
} from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";
import { api } from "@/lib/api/client";
import { useQuery, queryKeys, invalidateQueries } from "@/lib/api/queryCache";
import { useCurrentSession } from "@/lib/auth/currentUserContext";
import { TODAY, byDoctor, deptName, doctors as fixtureDoctors, rp, users as fixtureUsers } from "@/lib/fixtures";
import type {
  AdminUser,
  ApiDepartment,
  Appointment,
  AuthSession,
  CarePlanItem,
  Invoice,
  MyPatient,
  Patient,
  ReviewQueueEntry,
  ScheduleSlot,
  VisitNote,
  Widget,
  WidgetLayout,
  WidgetSize,
} from "@/lib/fixtures";

type Role = "Admin" | "Doctor" | "Nurse" | "Receptionist";

const SPAN: Record<WidgetSize, string> = {
  sm: "md:col-span-1 xl:col-span-1",
  md: "md:col-span-1 xl:col-span-1",
  lg: "md:col-span-2 xl:col-span-2",
};

function widgetState<T>(
  q: { data?: T; loading: boolean; error: Error | null },
  isEmpty: (d: T) => boolean,
): DataState {
  if (q.error) return "error";
  if (q.loading && !q.data) return "loading";
  if (!q.data) return "loading";
  return isEmpty(q.data) ? "empty" : "ready";
}

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

interface WidgetProps {
  role: Role;
  doctorId: number;
  userId: number;
  navigate: (href: string) => void;
}

function TodayAppointmentsWidget({ role, navigate }: WidgetProps) {
  const [doctorFilter, setDoctorFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const doctors = useQuery<{ users: AdminUser[] }>(queryKeys.users(), {
    fetcher: () => api.get<{ users: AdminUser[] }>("/admin/users", { query: { role: "doctor" } }),
  });
  const depts = useQuery<{ departments: ApiDepartment[] }>(queryKeys.departments(), {
    fetcher: () => api.get<{ departments: ApiDepartment[] }>("/admin/departments"),
  });
  const q = useQuery<{ appointments: Appointment[] }>(queryKeys.appointments({ date: TODAY }), {
    fetcher: () => api.get<{ appointments: Appointment[] }>("/appointments", { query: { date: TODAY } }),
  });
  const rows = useMemo(() => {
    const all = q.data?.appointments ?? [];
    return all.filter(
      (a) =>
        (!doctorFilter || a.doctor === doctorFilter) &&
        (!deptFilter || a.dept === deptFilter),
    );
  }, [q.data, doctorFilter, deptFilter]);
  const state = widgetState(q, (d) => d.appointments.length === 0);

  const isReceptionist = role === "Receptionist";

  return (
    <div className="space-y-3">
      {isReceptionist ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field
            id="wd-appt-doctor"
            label="Doctor"
            type="select"
            options={[
              { label: "All doctors", value: "" },
              ...(doctors.data?.users ?? []).map((u) => ({ label: u.full_name, value: String(u.id) })),
            ]}
            value={doctorFilter}
            onChange={(v) => setDoctorFilter(v)}
            renderIcon={renderIcon}
          />
          <Field
            id="wd-appt-dept"
            label="Department"
            type="select"
            options={[
              { label: "All departments", value: "" },
              ...(depts.data?.departments ?? []).map((d) => ({ label: `${d.code} — ${d.name}`, value: d.code })),
            ]}
            value={deptFilter}
            onChange={(v) => setDeptFilter(v)}
            renderIcon={renderIcon}
          />
        </div>
      ) : null}
      <StateRegion
        state={state}
        loading={<SkeletonRows rows={4} columns={3} />}
        empty={
          <EmptyState
            icon="calendar-x"
            title="No appointments today"
            body="Nothing on the books for this date yet."
            renderIcon={renderIcon}
          />
        }
        error={
          <ErrorState
            title="Could not load appointments"
            body={q.error?.message ?? "The schedule did not respond."}
            onRetry={q.refetch}
            renderIcon={renderIcon}
          />
        }
        ready={
          <ul className="divide-y divide-outline">
            {rows.slice(0, 8).map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/patients/${a.patient}`)}
                  className="press flex min-h-12 w-full items-center gap-2 py-2 text-left"
                >
                  <span className="num w-12 shrink-0 font-semibold">{a.time}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium">{a.reason}</span>
                    <span className="block text-2xs text-muted">
                      {byDoctor(a.doctor).name} · {deptName(a.dept)}
                    </span>
                  </span>
                  <StatusChip status={a.status} size="sm" renderIcon={renderIcon} />
                </button>
              </li>
            ))}
          </ul>
        }
      />
    </div>
  );
}

function RecentPatientsWidget({ navigate }: WidgetProps) {
  const q = useQuery<{ patients: Patient[]; total: number }>(queryKeys.patients({ page: 1, page_size: 5 }), {
    fetcher: () => api.get<{ patients: Patient[]; total: number }>("/patients", { query: { page: 1, page_size: 5 } }),
  });
  const state = widgetState(q, (d) => d.patients.length === 0);
  return (
    <StateRegion
      state={state}
      loading={<SkeletonRows rows={4} columns={2} />}
      empty={<EmptyState icon="users" title="No patients" body="Patients will appear here as they are seen." renderIcon={renderIcon} />}
      error={<ErrorState title="Could not load patients" body={q.error?.message ?? "The directory did not respond."} onRetry={q.refetch} renderIcon={renderIcon} />}
      ready={
        <ul className="divide-y divide-outline">
          {(q.data?.patients ?? []).map((p) => (
            <li key={p.mrn}>
              <button
                type="button"
                onClick={() => navigate(`/patients/${p.mrn}`)}
                className="press flex min-h-12 w-full items-center gap-2 py-2 text-left"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-container text-xs font-semibold text-primary-container-foreground">
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium">{p.name}</span>
                  <span className="num block text-2xs text-muted">
                    {p.mrn} · {deptName(p.dept)}
                  </span>
                </span>
                <StatusChip status={p.status} size="sm" renderIcon={renderIcon} />
              </button>
            </li>
          ))}
        </ul>
      }
    />
  );
}

function DepartmentOccupancyWidget() {
  const q = useQuery<{ departments: ApiDepartment[] & Array<{ occupied_beds?: number }> }>(queryKeys.departments(), {
    fetcher: () => api.get("/admin/departments"),
  });
  const state = widgetState(q, (d) => d.departments.length === 0);
  return (
    <StateRegion
      state={state}
      loading={<SkeletonRows rows={4} columns={2} />}
      empty={<EmptyState icon="bed-double" title="No departments" body="Departments will appear here." renderIcon={renderIcon} />}
      error={<ErrorState title="Could not load occupancy" body={q.error?.message ?? "The department service did not respond."} onRetry={q.refetch} renderIcon={renderIcon} />}
      ready={
        <div className="space-y-3">
          {(q.data?.departments ?? []).map((d) => (
            <Meter
              key={String(d.id)}
              label={d.name}
              value={Number((d as { occupied_beds?: number }).occupied_beds ?? 0)}
              max={d.bed_capacity}
              tone="primary"
              sub={`${d.code}`}
            />
          ))}
        </div>
      }
    />
  );
}

function RevenueMonthWidget() {
  const q = useQuery<{ invoices: Invoice[] }>(queryKeys.invoices(), {
    fetcher: () => api.get<{ invoices: Invoice[] }>("/invoices"),
  });
  const state = widgetState(q, (d) => d.invoices.length === 0);
  const total = (q.data?.invoices ?? []).reduce((s, i) => s + i.total, 0);
  const paid = (q.data?.invoices ?? []).reduce((s, i) => s + i.paid, 0);
  return (
    <StateRegion
      state={state}
      loading={<SkeletonRows rows={3} columns={2} />}
      empty={<EmptyState icon="trending-up" title="No invoices" body="Revenue will appear once invoices are created." renderIcon={renderIcon} />}
      error={<ErrorState title="Could not load revenue" body={q.error?.message ?? "The billing service did not respond."} onRetry={q.refetch} renderIcon={renderIcon} />}
      ready={
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-outline bg-surface-1 p-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Billed</p>
            <p className="num mt-1 text-lg font-bold">{rp(total)}</p>
          </div>
          <div className="rounded-lg border border-outline bg-surface-1 p-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Collected</p>
            <p className="num mt-1 text-lg font-bold text-success">{rp(paid)}</p>
          </div>
          <p className="col-span-2 text-2xs text-subtle">
            {total > 0 ? `${Math.round((paid / total) * 100)}% collected to date` : "Nothing billed this month."}
          </p>
        </div>
      }
    />
  );
}

function PendingRecordsWidget({ doctorId, role }: WidgetProps) {
  const doctorCode = doctorId ? fixturesDoctorCode(doctorId) : undefined;
  const q = useQuery<{ visits: VisitNote[] }>(["visits", "worklist", String(doctorId ?? "all")], {
    fetcher: () =>
      api.get<{ visits: VisitNote[] }>("/medical-records/visits", {
        query: role === "Doctor" && doctorCode ? { doctor_id: doctorCode } : {},
      }),
  });
  const pending = (q.data?.visits ?? []).filter((v) => v.status === "draft" || v.status === "submitted");
  const state = widgetState(q, (d) => d.visits.length === 0);
  return (
    <StateRegion
      state={state}
      loading={<SkeletonRows rows={4} columns={3} />}
      empty={<EmptyState icon="file-clock" title="No pending records" body="All visit notes are signed off." renderIcon={renderIcon} />}
      error={<ErrorState title="Could not load pending records" body={q.error?.message ?? "The records service did not respond."} onRetry={q.refetch} renderIcon={renderIcon} />}
      ready={
        <ul className="divide-y divide-outline">
          {pending.slice(0, 6).map((v) => (
            <li key={v.id} className="flex min-h-12 items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium">{v.diagnosis || v.chiefComplaint}</span>
                <span className="num block text-2xs text-muted">{v.patient} · {deptName(v.dept)}</span>
              </span>
              <StatusChip status={v.status} size="sm" renderIcon={renderIcon} />
            </li>
          ))}
        </ul>
      }
    />
  );
}

function StaffOnDutyWidget() {
  const q = useQuery<{ users: AdminUser[] }>(queryKeys.users(), {
    fetcher: () => api.get<{ users: AdminUser[] }>("/admin/users"),
  });
  const state = widgetState(q, (d) => d.users.length === 0);
  const counts = useMemo(() => {
    const groups = new Map<string, { active: number; total: number }>();
    for (const u of q.data?.users ?? []) {
      const key = u.department_name ?? "Unassigned";
      const g = groups.get(key) ?? { active: 0, total: 0 };
      g.total += 1;
      if (u.is_active) g.active += 1;
      groups.set(key, g);
    }
    return [...groups.entries()];
  }, [q.data]);
  return (
    <StateRegion
      state={state}
      loading={<SkeletonRows rows={3} columns={2} />}
      empty={<EmptyState icon="badge-check" title="No staff" body="Staff accounts will appear here." renderIcon={renderIcon} />}
      error={<ErrorState title="Could not load staff" body={q.error?.message ?? "The user directory did not respond."} onRetry={q.refetch} renderIcon={renderIcon} />}
      ready={
        <ul className="space-y-2">
          {counts.map(([dept, c]) => (
            <li key={dept} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-base">{dept}</span>
              <span className="num text-2xs text-muted">{c.active}/{c.total} active</span>
            </li>
          ))}
        </ul>
      }
    />
  );
}

function RegistrationQueueWidget({ navigate }: WidgetProps) {
  const q = useQuery<{ patients: Patient[]; total: number }>(queryKeys.patients({ admission_status: "admitted", page: 1, page_size: 6 }), {
    fetcher: () => api.get<{ patients: Patient[]; total: number }>("/patients", { query: { admission_status: "admitted", page: 1, page_size: 6 } }),
  });
  const state = widgetState(q, (d) => d.patients.length === 0);
  return (
    <div className="space-y-3">
      <StateRegion
        state={state}
        loading={<SkeletonRows rows={4} columns={2} />}
        empty={
          <EmptyState
            icon="clipboard-check"
            title="Registration queue clear"
            body="No admitted patients waiting for check-in."
            renderIcon={renderIcon}
          />
        }
        error={<ErrorState title="Could not load the queue" body={q.error?.message ?? "The directory did not respond."} onRetry={q.refetch} renderIcon={renderIcon} />}
        ready={
          <ul className="divide-y divide-outline">
            {(q.data?.patients ?? []).slice(0, 6).map((p) => (
              <li key={p.mrn}>
                <button
                  type="button"
                  onClick={() => navigate(`/patients/${p.mrn}`)}
                  className="press flex min-h-12 w-full items-center gap-2 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium">{p.name}</span>
                    <span className="num block text-2xs text-muted">{p.mrn} · {deptName(p.dept)}</span>
                  </span>
                  <StatusChip status={p.status} size="sm" renderIcon={renderIcon} />
                </button>
              </li>
            ))}
          </ul>
        }
      />
      <Button variant="primary" icon={renderIcon("user-plus", "h-4 w-4")} onClick={() => navigate("/patients/register")} data-testid="register-patient">
        Register new patient
      </Button>
    </div>
  );
}

function TodayScheduleWidget({ doctorId, navigate }: WidgetProps) {
  const [selectedSlot, setSelectedSlot] = useState<ScheduleSlot | null>(null);
  const appt = useQuery<{ appointment: Appointment }>(
    ["appointments", "detail", selectedSlot?.appointment_id ?? 0],
    {
      fetcher: () => api.get<{ appointment: Appointment }>(`/appointments/${selectedSlot!.appointment_id}`),
      enabled: Boolean(selectedSlot?.appointment_id),
    },
  );
  const q = useQuery<{ doctor_id: number; date: string; slots: ScheduleSlot[] }>(queryKeys.doctorSchedule(doctorId, TODAY), {
    fetcher: () => api.get(`/doctors/${doctorId}/schedule`, { query: { date: TODAY } }),
    enabled: doctorId > 0,
  });
  const state = widgetState(q, (d) => d.slots.length === 0);
  return (
    <div className="space-y-3">
      <StateRegion
        state={state}
        loading={<SkeletonRows rows={4} columns={3} />}
        empty={
          <EmptyState
            icon="calendar-off"
            title="No clinic session today"
            body="There are no scheduled slots for you today."
            renderIcon={renderIcon}
          />
        }
        error={<ErrorState title="Could not load today's schedule" body={q.error?.message ?? "The schedule did not respond."} onRetry={q.refetch} renderIcon={renderIcon} />}
        ready={
          <ul className="divide-y divide-outline">
            {(q.data?.slots ?? []).map((s) => (
              <li key={s.start_epoch}>
                <button
                  type="button"
                  onClick={() => s.status === "booked" && setSelectedSlot(s)}
                  disabled={s.status !== "booked"}
                  className={`press flex min-h-12 w-full items-center gap-2 py-2 text-left ${
                    s.status === "booked" ? "" : "cursor-default opacity-60"
                  }`}
                >
                  <span className="num w-12 shrink-0 font-semibold">{s.start.slice(11, 16)}</span>
                  <span className="min-w-0 flex-1">
                    {s.status === "booked" ? (
                      <>
                        <span className="block truncate text-base font-medium">{s.reason ?? "Appointment"}</span>
                        <span className="num block text-2xs text-muted">
                          Patient {s.patient_id ?? "—"}
                        </span>
                      </>
                    ) : (
                      <span className="block text-base text-muted">
                        {s.status === "blocked" ? `Blocked${s.reason ? ` — ${s.reason}` : ""}` : "Open"}
                      </span>
                    )}
                  </span>
                  {s.status === "booked" ? <StatusChip status="booked" size="sm" renderIcon={renderIcon} /> : null}
                </button>
              </li>
            ))}
          </ul>
        }
      />

      <Dialog
        open={selectedSlot !== null}
        title="Appointment detail"
        size="sm"
        onClose={() => setSelectedSlot(null)}
        renderIcon={renderIcon}
        actions={[
          { label: "Close", variant: "primary" },
          {
            label: "Open patient",
            variant: "outline",
            icon: "user",
            onAction: () => {
              if (appt.data?.appointment.patient) {
                navigate(`/patients/${appt.data.appointment.patient}`);
              }
            },
          },
        ]}
      >
        {appt.loading ? (
          <SkeletonRows rows={3} columns={2} />
        ) : appt.error ? (
          <ErrorState title="Could not load appointment" body={appt.error.message} onRetry={appt.refetch} renderIcon={renderIcon} />
        ) : appt.data ? (
          <dl className="space-y-2 text-base">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Time</dt>
              <dd className="num font-medium">
                {appt.data.appointment.date} {appt.data.appointment.time}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Patient</dt>
              <dd className="num font-medium">{appt.data.appointment.patient}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Reason</dt>
              <dd className="text-right font-medium">{appt.data.appointment.reason}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Status</dt>
              <dd>
                <StatusChip status={appt.data.appointment.status} renderIcon={renderIcon} />
              </dd>
            </div>
          </dl>
        ) : null}
      </Dialog>
    </div>
  );
}

function VitalsQueueWidget() {
  const q = useQuery<{ queue: ReviewQueueEntry[]; count: number }>(["medical-records", "vitals", "review-queue"], {
    fetcher: () => api.get<{ queue: ReviewQueueEntry[]; count: number }>("/medical-records/vitals/review-queue"),
  });
  const state = widgetState(q, (d) => d.queue.length === 0);
  return (
    <StateRegion
      state={state}
      loading={<SkeletonRows rows={4} columns={3} />}
      empty={
        <EmptyState
          icon="activity"
          title="No critical readings"
          body="No vitals in the last 24 hours need review."
          renderIcon={renderIcon}
        />
      }
      error={<ErrorState title="Could not load vitals queue" body={q.error?.message ?? "The vitals service did not respond."} onRetry={q.refetch} renderIcon={renderIcon} />}
      ready={
        <ul className="divide-y divide-outline">
          {(q.data?.queue ?? []).slice(0, 6).map((r) => (
            <li key={String(r.id)} className="flex min-h-12 items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium">{r.patient_name}</span>
                <span className="num block text-2xs text-muted">
                  {r.patient_mrn} · BP {r.systolic}/{r.diastolic} · HR {r.heart_rate} · SpO₂ {r.spo2}%
                </span>
              </span>
              <span className="rounded-full bg-danger-container px-2 py-0.5 text-2xs font-semibold text-danger-container-foreground">
                Critical
              </span>
            </li>
          ))}
        </ul>
      }
    />
  );
}

function AssignedPatientsWidget({ userId }: WidgetProps) {
  const q = useQuery<{ patients: MyPatient[] }>(["admin", "users", userId, "my-patients"], {
    fetcher: () => api.get<{ patients: MyPatient[] }>(`/admin/users/${userId}/my-patients`, { query: { shift_date: TODAY } }),
    enabled: userId > 0,
  });
  const state = widgetState(q, (d) => d.patients.length === 0);
  return (
    <StateRegion
      state={state}
      loading={<SkeletonRows rows={4} columns={2} />}
      empty={<EmptyState icon="user-check" title="No patients assigned" body="Your ward assignment is empty this shift." renderIcon={renderIcon} />}
      error={<ErrorState title="Could not load assigned patients" body={q.error?.message ?? "The assignment service did not respond."} onRetry={q.refetch} renderIcon={renderIcon} />}
      ready={
        <ul className="divide-y divide-outline">
          {(q.data?.patients ?? []).map((p) => (
            <li key={String(p.assignment_id)} className="flex min-h-12 items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium">{p.full_name}</span>
                <span className="num block text-2xs text-muted">
                  {p.mrn} · {p.admission_status}
                  {p.bed_label ? ` · ${p.bed_label}` : ""}
                </span>
              </span>
              {p.vitals_due ? (
                <span className="rounded-full bg-warning-container px-2 py-0.5 text-2xs font-semibold text-warning-container-foreground">
                  Vitals due
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      }
    />
  );
}

function VitalsEntryWidget({ userId }: WidgetProps) {
  const q = useQuery<{ patients: MyPatient[] }>(["admin", "users", userId, "my-patients"], {
    fetcher: () => api.get<{ patients: MyPatient[] }>(`/admin/users/${userId}/my-patients`, { query: { shift_date: TODAY } }),
    enabled: userId > 0,
  });
  const state = widgetState(q, (d) => d.patients.length === 0);
  const due = (q.data?.patients ?? []).filter((p) => p.vitals_due);
  return (
    <StateRegion
      state={state}
      loading={<SkeletonRows rows={3} columns={2} />}
      empty={<EmptyState icon="stethoscope" title="No readings due" body="All assigned patients have fresh vitals." renderIcon={renderIcon} />}
      error={<ErrorState title="Could not load the vitals list" body={q.error?.message ?? "The vitals service did not respond."} onRetry={q.refetch} renderIcon={renderIcon} />}
      ready={
        <ul className="space-y-2">
          {(due.length ? due : (q.data?.patients ?? [])).slice(0, 5).map((p) => (
            <li key={String(p.assignment_id)} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-base">{p.full_name}</span>
              {p.vitals_due ? (
                <span className="text-2xs font-semibold text-warning">due</span>
              ) : (
                <span className="text-2xs text-success">up to date</span>
              )}
            </li>
          ))}
        </ul>
      }
    />
  );
}

function CarePlanWidget({ userId }: WidgetProps) {
  const q = useQuery<{ items: CarePlanItem[] }>(["medical-records", "care-plan", "queue", String(userId)], {
    fetcher: async () => {
      const assigned = await api.get<{ patients: MyPatient[] }>(`/admin/users/${userId}/my-patients`, { query: { shift_date: TODAY } });
      const plans = await Promise.all(
        assigned.patients.slice(0, 8).map((p) =>
          api.get<{ patient_id: string; items: CarePlanItem[] }>(`/medical-records/patients/${p.mrn}/care-plan`),
        ),
      );
      const items = plans
        .flatMap((pl) => pl.items)
        .filter((it) => !it.completed)
        .sort((a, b) => (a.priority === "high" ? -1 : b.priority === "high" ? 1 : 0))
        .slice(0, 8);
      return { items };
    },
    enabled: userId > 0,
  });
  const state = widgetState(q, (d) => d.items.length === 0);
  return (
    <StateRegion
      state={state}
      loading={<SkeletonRows rows={4} columns={2} />}
      empty={
        <EmptyState
          icon="list-checks"
          title="Care plan complete"
          body="No open care plan items for your assigned patients."
          renderIcon={renderIcon}
        />
      }
      error={<ErrorState title="Could not load care plan" body={q.error?.message ?? "The care plan service did not respond."} onRetry={q.refetch} renderIcon={renderIcon} />}
      ready={
        <ul className="divide-y divide-outline">
          {(q.data?.items ?? []).map((it) => (
            <li key={it.id} className="flex min-h-12 items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium">{it.description}</span>
                <span className="num block text-2xs text-muted">{it.patient} · due {it.dueAt.slice(0, 10)}</span>
              </span>
              {it.priority === "high" ? (
                <span className="rounded-full bg-danger-container px-2 py-0.5 text-2xs font-semibold text-danger-container-foreground">
                  High
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Widget factory
// ---------------------------------------------------------------------------

function fixturesDoctorCode(userId: number): string | undefined {
  const staff = fixtureUsers[userId - 1];
  if (!staff) return undefined;
  return fixtureDoctors.find((d) => d.userId === staff.id)?.id;
}

function buildDefinitions(props: WidgetProps, widgets: Widget[]): WidgetDefinition[] {
  const renderers: Record<string, () => React.ReactNode> = {
    "todays-appointments": () => <TodayAppointmentsWidget {...props} />,
    "recent-patients": () => <RecentPatientsWidget {...props} />,
    "department-occupancy": () => <DepartmentOccupancyWidget />,
    "revenue-month": () => <RevenueMonthWidget />,
    "pending-records": () => <PendingRecordsWidget {...props} />,
    "staff-on-duty": () => <StaffOnDutyWidget />,
    "registration-queue": () => <RegistrationQueueWidget {...props} />,
    "todays-schedule": () => <TodayScheduleWidget {...props} />,
    "vitals-queue": () => <VitalsQueueWidget />,
    "assigned-patients": () => <AssignedPatientsWidget {...props} />,
    "vitals-entry": () => <VitalsEntryWidget {...props} />,
    "care-plan": () => <CarePlanWidget {...props} />,
  };
  return widgets
    .filter((w) => renderers[w.key])
    .map((w) => ({
      key: w.key,
      name: w.name,
      icon: w.icon,
      roles: w.roles as WidgetDefinition["roles"],
      enabled: w.enabled,
      locked: w.locked,
      span: SPAN[w.size],
      meta: w.desc,
      render: renderers[w.key],
    }));
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function DashboardScreen() {
  const { session } = useCurrentSession();
  const router = useRouter();
  const role = session.role as Role;
  const [order, setOrder] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [libraryOpen, setLibraryOpen] = useState(false);
  const saveTimer = React.useRef<number | null>(null);

  const me = useQuery<AuthSession>(queryKeys.me(), {
    fetcher: () => api.get<AuthSession>("/auth/me"),
  });

  const myWidgets = useQuery<{ widgets: Widget[]; layout: WidgetLayout[] }>(queryKeys.myLayout(), {
    fetcher: () =>
      api.get<{ widgets: Widget[]; layout: WidgetLayout[] }>("/widgets/me", {
        query: { role: role.toLowerCase() },
      }),
  });

  const library = useQuery<{ widgets: Widget[] }>(queryKeys.widgetLibrary(), {
    fetcher: () => api.get<{ widgets: Widget[] }>("/widgets/admin/library"),
  });

  // Initialise the visible order from the server layout.
  useEffect(() => {
    if (!myWidgets.data) return;
    const widgets = myWidgets.data.widgets.filter((w) => w.enabled);
    const layout = myWidgets.data.layout;
    const ordered = [...widgets].sort((a, b) => {
      const pa = layout.find((l) => l.widgetKey === a.key)?.positionOrder ?? 999;
      const pb = layout.find((l) => l.widgetKey === b.key)?.positionOrder ?? 999;
      return pa - pb;
    });
    setOrder(ordered.map((w) => w.key));
  }, [myWidgets.data]);

  const persist = useCallback(
    (nextOrder: string[], nextHidden: Set<string>) => {
      if (!myWidgets.data) return;
      const data = myWidgets.data;
      const layout: WidgetLayout[] = [
        ...nextOrder.map((key, i) => {
          const w = data.widgets.find((x) => x.key === key) ?? library.data?.widgets.find((x) => x.key === key);
          return {
            userId: String(me.data?.id ?? 0),
            widgetKey: key,
            positionOrder: i,
            enabled: true,
            size: (w?.size ?? "md") as WidgetSize,
          };
        }),
        ...[...nextHidden].map((key, i) => ({
          userId: String(me.data?.id ?? 0),
          widgetKey: key,
          positionOrder: nextOrder.length + i,
          enabled: false,
          size: "md" as WidgetSize,
        })),
      ];
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        // Local `order`/`hidden` state is the optimistic UI. A failed write
        // invalidates the layout so the authoritative server state re-renders
        // instead of leaving a mismatched grid.
        void api
          .put("/widgets/me", { role: role.toLowerCase(), layout })
          .then(() => {
            invalidateQueries(queryKeys.myLayout() as unknown as unknown[]);
          })
          .catch(() => {
            invalidateQueries(queryKeys.myLayout() as unknown as unknown[]);
          });
      }, 400);
    },
    [myWidgets.data, library.data, me.data, role],
  );

  const onReorder = useCallback(
    (next: string[]) => {
      setOrder(next);
      persist(next, hidden);
    },
    [persist, hidden],
  );

  const onRemove = useCallback(
    (key: string) => {
      const nextHidden = new Set(hidden);
      nextHidden.add(key);
      setHidden(nextHidden);
      const nextOrder = order.filter((k) => k !== key);
      setOrder(nextOrder);
      persist(nextOrder, nextHidden);
    },
    [hidden, order, persist],
  );

  const onAdd = useCallback(
    (w: Widget) => {
      const nextHidden = new Set(hidden);
      nextHidden.delete(w.key);
      setHidden(nextHidden);
      const nextOrder = order.includes(w.key) ? order : [...order, w.key];
      setOrder(nextOrder);
      setLibraryOpen(false);
      persist(nextOrder, nextHidden);
    },
    [hidden, order, persist],
  );

  const visibleWidgets = useMemo(() => {
    if (!myWidgets.data) return [];
    const widgets = myWidgets.data.widgets.filter((w) => w.enabled && !hidden.has(w.key));
    const byKey = new Map(widgets.map((w) => [w.key, w]));
    const present = order.filter((k) => byKey.has(k));
    const remaining = widgets.filter((w) => !present.includes(w.key)).map((w) => w.key);
    return [...present, ...remaining];
  }, [myWidgets.data, order, hidden]);

  const definitions = useMemo(() => {
    if (!myWidgets.data) return [];
    const roleWidgets = myWidgets.data.widgets.filter((w) => w.enabled && !hidden.has(w.key));
    const byKey = new Map(roleWidgets.map((w) => [w.key, w]));
    return buildDefinitions(
      {
        role,
        doctorId: me.data?.id ?? 0,
        userId: me.data?.id ?? 0,
        navigate: (href) => router.push(href),
      },
      visibleWidgets.map((k) => byKey.get(k)).filter((w): w is Widget => Boolean(w)),
    );
  }, [myWidgets.data, visibleWidgets, role, me.data, router, hidden]);

  const addableWidgets = useMemo(() => {
    const current = new Set(visibleWidgets);
    return (library.data?.widgets ?? [])
      .filter((w) => w.roles.includes(role as Widget["roles"][number]))
      .filter((w) => !current.has(w.key) && !w.locked);
  }, [library.data, visibleWidgets, role]);

  const screenState: DataState = myWidgets.error
    ? "error"
    : myWidgets.loading && !myWidgets.data
      ? "loading"
      : (myWidgets.data?.widgets.filter((w) => w.enabled).length ?? 0) === 0
        ? "empty"
        : "ready";

  return (
    <div className="space-y-4 p-4 lg:p-6" data-testid="dashboard">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-base text-muted">
            Welcome back, {session.name} — here&apos;s what needs your attention today.
          </p>
        </div>
        <Button
          variant="outline"
          icon={renderIcon("layout-grid", "h-4 w-4")}
          onClick={() => setLibraryOpen(true)}
          data-testid="add-widget"
        >
          Add widget
        </Button>
      </header>

      <StateRegion
        state={screenState}
        loading={<SkeletonRows rows={6} columns={4} />}
        empty={
          <EmptyState
            icon="layout-grid"
            title="No widgets enabled"
            body="Add widgets from the library to build your dashboard."
            action={
              <Button variant="primary" onClick={() => setLibraryOpen(true)}>
                Add widget
              </Button>
            }
            renderIcon={renderIcon}
          />
        }
        error={
          <ErrorState
            title="Could not load your dashboard"
            body={myWidgets.error?.message ?? "The widget service did not respond."}
            onRetry={myWidgets.refetch}
            renderIcon={renderIcon}
          />
        }
        ready={
          <WidgetGrid
            widgets={definitions}
            order={visibleWidgets}
            onReorder={onReorder}
            onRemove={onRemove}
            renderIcon={renderIcon}
          />
        }
      />

      <Dialog
        open={libraryOpen}
        title="Widget library"
        size="md"
        onClose={() => setLibraryOpen(false)}
        renderIcon={renderIcon}
        actions={[{ label: "Close", variant: "primary" }]}
      >
        {addableWidgets.length === 0 ? (
          <EmptyState
            icon="check-circle-2"
            title="Nothing more to add"
            body="Every widget available to your role is already on your dashboard."
            renderIcon={renderIcon}
          />
        ) : (
          <ul className="divide-y divide-outline">
            {addableWidgets.map((w) => (
              <li key={w.key} className="flex min-h-12 items-center gap-3 py-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
                  {renderIcon(w.icon, "h-4 w-4")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium">{w.name}</p>
                  <p className="text-2xs text-muted">{w.desc}</p>
                </div>
                <Button variant="subtle" size="sm" icon={renderIcon("plus", "h-3.5 w-3.5")} onClick={() => onAdd(w)}>
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </div>
  );
}

export default DashboardScreen;