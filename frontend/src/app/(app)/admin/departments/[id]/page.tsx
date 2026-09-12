"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  EmptyState,
  ErrorState,
  Meter,
  SkeletonRows,
  StateRegion,
  type DataState,
} from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";
import { api } from "@/lib/api/client";
import { useQuery, queryKeys, invalidateQueries } from "@/lib/api/queryCache";
import type { ApiDepartment, DepartmentCapacity, DepartmentStaffAssignment } from "@/lib/fixtures";

type TabId = "capacity" | "staff";

export default function DepartmentDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("capacity");

  const dept = useQuery<{ department: ApiDepartment }>(queryKeys.department(id), {
    fetcher: () => api.get<{ department: ApiDepartment }>(`/admin/departments/${id}`),
  });
  const capacity = useQuery<DepartmentCapacity>(["admin", "departments", id, "capacity"], {
    fetcher: () => api.get<DepartmentCapacity>(`/admin/departments/${id}/capacity`),
  });
  const staff = useQuery<{ assignments: DepartmentStaffAssignment[] }>(["admin", "departments", id, "staff"], {
    fetcher: () => api.get<{ assignments: DepartmentStaffAssignment[] }>("/admin/department-staff", { query: { department_id: id } }),
    enabled: tab === "staff",
  });

  const state: DataState = dept.error
    ? "error"
    : dept.loading && !dept.data
      ? "loading"
      : !dept.data
        ? "loading"
        : "ready";

  const capState: DataState = capacity.error
    ? "error"
    : capacity.loading && !capacity.data
      ? "loading"
      : !capacity.data
        ? "loading"
        : "ready";

  const staffState: DataState = staff.error
    ? "error"
    : staff.loading && !staff.data
      ? "loading"
      : (staff.data?.assignments.length ?? 0) === 0
        ? "empty"
        : "ready";

  const onUnassign = useCallback(
    async (assignmentId: number | string) => {
      try {
        await api.delete(`/admin/department-staff/${assignmentId}`);
        invalidateQueries(["admin", "departments", id] as unknown as unknown[]);
        staff.refetch();
      } catch {
        /* the row stays until a successful unassign */
      }
    },
    [id, staff],
  );

  const d = dept.data?.department;

  return (
    <div className="space-y-4 p-4 lg:p-6" data-testid="department-detail">
      <StateRegion
        state={state}
        loading={<SkeletonRows rows={3} columns={4} />}
        empty={
          <EmptyState
            icon="building-2"
            title={`No department ${id}`}
            body="This department could not be found."
            renderIcon={renderIcon}
          />
        }
        error={
          <ErrorState
            title="Could not load department"
            body={dept.error?.message ?? "The department service did not respond."}
            onRetry={dept.refetch}
            renderIcon={renderIcon}
          />
        }
        ready={
          <>
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold">{d?.name}</h1>
                  <span className="num rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-muted">{d?.code}</span>
                </div>
                <p className="mt-1 text-base text-muted">
                  {d?.type} department · {d?.bed_capacity} beds
                </p>
              </div>
              <Button variant="ghost" icon={renderIcon("arrow-left", "h-4 w-4")} onClick={() => router.push("/admin/departments")}>
                Back to departments
              </Button>
            </header>

            <div
              className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-outline bg-surface-1 p-1"
              role="tablist"
              aria-label="Department views"
            >
              {(
                [
                  { id: "capacity", label: "Capacity", icon: "bed-double" },
                  { id: "staff", label: "Staff assignments", icon: "users" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`press inline-flex min-h-11 items-center gap-1.5 rounded-lg px-4 text-base font-medium ${
                    tab === t.id ? "bg-primary text-primary-foreground" : "text-muted hover:bg-surface-3 hover:text-foreground"
                  }`}
                >
                  {renderIcon(t.icon, "h-4 w-4")}
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "capacity" ? (
              <StateRegion
                state={capState}
                loading={<SkeletonRows rows={4} columns={3} />}
                empty={
                  <EmptyState
                    icon="bed-double"
                    title="No capacity data"
                    body="Capacity is empty for this department."
                    renderIcon={renderIcon}
                  />
                }
                error={
                  <ErrorState
                    title="Could not load capacity"
                    body={capacity.error?.message ?? "The capacity endpoint did not respond."}
                    onRetry={capacity.refetch}
                    renderIcon={renderIcon}
                  />
                }
                ready={
                  <div className="card space-y-4 !p-4" aria-label="Capacity">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="card !p-3.5">
                        <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Occupied beds</p>
                        <p className="num mt-1 text-xl font-bold">{capacity.data?.occupied_beds}</p>
                      </div>
                      <div className="card !p-3.5">
                        <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Available beds</p>
                        <p className="num mt-1 text-xl font-bold text-success">{capacity.data?.available_beds}</p>
                      </div>
                      <div className="card !p-3.5">
                        <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Assigned staff</p>
                        <p className="num mt-1 text-xl font-bold">{capacity.data?.assigned_staff_count ?? 0}</p>
                      </div>
                    </div>
                    <Meter
                      label="Occupancy"
                      value={capacity.data?.occupied_beds ?? 0}
                      max={capacity.data?.bed_capacity ?? 0}
                      tone="primary"
                      sub={`${capacity.data?.occupied_beds} occupied of ${capacity.data?.bed_capacity} beds`}
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-outline bg-surface-1 p-3">
                        <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Min clinicians per shift</p>
                        <p className="num mt-1 text-base font-semibold">{capacity.data?.min_clinicians_per_shift ?? 0}</p>
                      </div>
                      <div className="rounded-lg border border-outline bg-surface-1 p-3">
                        <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Pressure</p>
                        <p className="num mt-1 text-base font-semibold">
                          {Math.round(capacity.data?.pressure ?? 0)}%
                        </p>
                      </div>
                    </div>
                  </div>
                }
              />
            ) : (
              <StateRegion
                state={staffState}
                loading={<SkeletonRows rows={4} columns={4} />}
                empty={
                  <div className="card !p-0">
                    <EmptyState
                      icon="users"
                      title="No staff assigned"
                      body="Assign clinicians to this department so shifts can be covered."
                      renderIcon={renderIcon}
                    />
                  </div>
                }
                error={
                  <div className="card !p-0">
                    <ErrorState
                      title="Could not load staff assignments"
                      body={staff.error?.message ?? "The staff endpoint did not respond."}
                      onRetry={staff.refetch}
                      renderIcon={renderIcon}
                    />
                  </div>
                }
                ready={
                  <div className="card divide-y divide-outline !p-0">
                    {(staff.data?.assignments ?? []).map((a) => (
                      <div key={String(a.id)} className="flex flex-wrap items-center gap-3 p-4">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-container text-primary-container-foreground">
                          {a.full_name.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-medium">{a.full_name}</p>
                          <p className="text-2xs text-muted">{a.user_email}</p>
                        </div>
                        <span className="num text-2xs text-subtle">{a.assigned_at.slice(0, 10)}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={renderIcon("user-minus", "h-4 w-4")}
                          onClick={() => onUnassign(a.id)}
                        >
                          Unassign
                        </Button>
                      </div>
                    ))}
                  </div>
                }
              />
            )}
          </>
        }
      />
    </div>
  );
}