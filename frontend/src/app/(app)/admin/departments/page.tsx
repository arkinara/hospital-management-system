"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Meter,
  SkeletonRows,
  StateRegion,
  ToastProvider,
  useToast,
  type Column,
  type DataState,
} from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";
import { api } from "@/lib/api/client";
import { useQuery, queryKeys, invalidateQueries } from "@/lib/api/queryCache";
import type { ApiDepartment } from "@/lib/fixtures";

interface DepartmentRow extends ApiDepartment {
  occupied_beds: number;
  total_beds: number;
  occupancy_pct: number;
  min_clinicians_per_shift: number;
}

const TYPE_OPTIONS = [
  { label: "General", value: "general" },
  { label: "Pediatric", value: "pediatric" },
  { label: "Cardiology", value: "cardiology" },
  { label: "Emergency", value: "emergency" },
  { label: "Neurology", value: "neurology" },
];

export default function DepartmentsPage() {
  return (
    <ToastProvider renderIcon={renderIcon}>
      <DepartmentsScreen />
    </ToastProvider>
  );
}

function DepartmentsScreen() {
  const router = useRouter();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    code: "",
    type: "general",
    bed_capacity: "20",
    min_clinicians_per_shift: "2",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const depts = useQuery<{ departments: DepartmentRow[] }>(queryKeys.departments(), {
    fetcher: () => api.get<{ departments: DepartmentRow[] }>("/admin/departments"),
  });

  const rows = depts.data?.departments ?? [];

  const columns: Column<DepartmentRow>[] = [
    { key: "code", label: "Code", mono: true, cell: (d) => <span className="num font-semibold">{d.code}</span> },
    { key: "name", label: "Name", cell: (d) => d.name },
    { key: "type", label: "Type", cell: (d) => <span className="capitalize">{d.type}</span> },
    { key: "bed_capacity", label: "Bed capacity", align: "right", mono: true, cell: (d) => <span className="num">{d.bed_capacity}</span> },
    {
      key: "occupancy",
      label: "Occupancy",
      cell: (d) => (
        <Meter
          label=""
          value={d.occupied_beds}
          max={d.bed_capacity}
          tone="primary"
          sub={`${d.occupied_beds} beds occupied · ${d.total_beds} total`}
        />
      ),
    },
    {
      key: "min_clinicians",
      label: "Min clinicians",
      align: "right",
      mono: true,
      cell: (d) => <span className="num">{d.min_clinicians_per_shift}</span>,
    },
  ];

  const state: DataState = depts.error
    ? "error"
    : depts.loading && !depts.data
      ? "loading"
      : rows.length === 0
        ? "empty"
        : "ready";

  const onCreate = useCallback(async () => {
    if (!form.name.trim() || !form.code.trim()) {
      setFormError("Name and code are required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await api.post<{ department: ApiDepartment }>("/admin/departments", {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        type: form.type,
        bed_capacity: Number(form.bed_capacity) || 0,
        min_clinicians_per_shift: Number(form.min_clinicians_per_shift) || 0,
        active: 1,
      });
      invalidateQueries(queryKeys.departments() as unknown as unknown[]);
      setCreateOpen(false);
      toast({ tone: "success", message: `Department ${created.department.code} created` });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not create the department.");
    } finally {
      setSaving(false);
    }
  }, [form, toast]);

  return (
    <div className="space-y-4 p-4 lg:p-6" data-testid="admin-departments">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Departments</h1>
          <p className="mt-1 text-base text-muted">
            {rows.length > 0 ? `${rows.length} departments across the hospital` : "Departments, capacity and staffing"}
          </p>
        </div>
        <Button
          variant="primary"
          icon={renderIcon("building-plus", "h-4 w-4")}
          onClick={() => {
            setForm({ name: "", code: "", type: "general", bed_capacity: "20", min_clinicians_per_shift: "2" });
            setFormError(null);
            setCreateOpen(true);
          }}
          data-testid="new-department"
        >
          New department
        </Button>
      </header>

      <StateRegion
        state={state}
        loading={<SkeletonRows rows={5} columns={6} />}
        empty={
          <div className="card !p-0">
            <EmptyState
              icon="building-2"
              title="No departments yet"
              body="Create the first department to start organising care."
              action={
                <Button
                  variant="primary"
                  onClick={() => {
                    setFormError(null);
                    setCreateOpen(true);
                  }}
                >
                  New department
                </Button>
              }
              renderIcon={renderIcon}
            />
          </div>
        }
        error={
          <div className="card !p-0">
            <ErrorState
              title="Could not load departments"
              body={depts.error?.message ?? "The department service did not respond."}
              onRetry={depts.refetch}
              renderIcon={renderIcon}
            />
          </div>
        }
        ready={
          <div className="card overflow-hidden !p-0">
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(d) => String(d.id)}
              label="Departments"
              caption="Departments, bed capacity and current occupancy"
              rowLabel={(d) => `${d.name} (${d.code})`}
              onRowActivate={(d) => router.push(`/admin/departments/${d.id}`)}
              renderIcon={renderIcon}
              mobileCard={(d) => (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="num font-semibold">{d.code}</span>
                    <span className="flex-1 font-medium">{d.name}</span>
                  </div>
                  <Meter label="" value={d.occupied_beds} max={d.bed_capacity} tone="primary" sub={`${d.occupied_beds}/${d.bed_capacity} beds`} />
                </div>
              )}
            />
          </div>
        }
      />

      <Dialog
        open={createOpen}
        title="New department"
        size="md"
        onClose={() => setCreateOpen(false)}
        renderIcon={renderIcon}
        actions={[
          { label: "Cancel", variant: "ghost" },
          {
            label: "Create department",
            variant: "primary",
            icon: "building-plus",
            onAction: () => {
              void onCreate();
              return false;
            },
          },
        ]}
      >
        <div className="space-y-4" data-testid="new-department-form">
          <Field
            id="nd-name"
            label="Name"
            type="text"
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            required
            renderIcon={renderIcon}
          />
          <Field
            id="nd-code"
            label="Code"
            type="text"
            value={form.code}
            onChange={(v) => setForm((f) => ({ ...f, code: v }))}
            help="Short code, e.g. GEN, CAR."
            required
            renderIcon={renderIcon}
          />
          <Field
            id="nd-type"
            label="Type"
            type="select"
            options={TYPE_OPTIONS}
            value={form.type}
            onChange={(v) => setForm((f) => ({ ...f, type: v }))}
            renderIcon={renderIcon}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="nd-beds"
              label="Bed capacity"
              type="number"
              value={form.bed_capacity}
              onChange={(v) => setForm((f) => ({ ...f, bed_capacity: v }))}
              mono
              renderIcon={renderIcon}
            />
            <Field
              id="nd-min"
              label="Min clinicians per shift"
              type="number"
              value={form.min_clinicians_per_shift}
              onChange={(v) => setForm((f) => ({ ...f, min_clinicians_per_shift: v }))}
              mono
              renderIcon={renderIcon}
            />
          </div>
          {formError ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {formError}
            </p>
          ) : null}
          {saving ? (
            <p className="text-sm text-muted" role="status">
              Creating department…
            </p>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}