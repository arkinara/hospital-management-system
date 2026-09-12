"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  Button,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  SkeletonRows,
  StateRegion,
  StatusChip,
  ToastProvider,
  useToast,
  type Column,
  type DataState,
} from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";
import { api } from "@/lib/api/client";
import { useQuery, queryKeys, invalidateQueries } from "@/lib/api/queryCache";
import type { AdminUser, ApiDepartment, Role } from "@/lib/fixtures";

const ROLE_OPTIONS: Array<{ label: string; value: Role }> = [
  { label: "Admin", value: "admin" },
  { label: "Doctor", value: "doctor" },
  { label: "Nurse", value: "nurse" },
  { label: "Receptionist", value: "receptionist" },
];

function formatLastLogin(epoch: number | null): string {
  if (epoch == null) return "Never";
  return new Date(epoch * 1000).toISOString().slice(0, 10);
}

export default function UsersPage() {
  return (
    <ToastProvider renderIcon={renderIcon}>
      <UsersScreen />
    </ToastProvider>
  );
}

function UsersScreen() {
  const { toast } = useToast();
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "receptionist" as Role,
    department_id: "",
    specialisation: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const depts = useQuery<{ departments: ApiDepartment[] }>(queryKeys.departments(), {
    fetcher: () => api.get<{ departments: ApiDepartment[] }>("/admin/departments"),
  });

  const users = useQuery<{ users: AdminUser[] }>(
    queryKeys.users(),
    {
      fetcher: () =>
        api.get<{ users: AdminUser[] }>("/admin/users", {
          query: {
            role: roleFilter || undefined,
          },
        }),
    },
  );

  const rows = useMemo(() => {
    const list = users.data?.users ?? [];
    if (activeFilter === "active") return list.filter((u) => u.is_active);
    if (activeFilter === "inactive") return list.filter((u) => !u.is_active);
    return list;
  }, [users.data, activeFilter]);

  const columns: Column<AdminUser>[] = [
    { key: "full_name", label: "Name", cell: (u) => u.full_name },
    { key: "email", label: "Email", cell: (u) => <span className="text-muted">{u.email}</span> },
    {
      key: "role",
      label: "Role",
      cell: (u) => (
        <span className="inline-flex items-center gap-1 capitalize">
          {renderIcon(u.role === "doctor" ? "stethoscope" : u.role === "nurse" ? "heart-pulse" : u.role === "admin" ? "shield-check" : "headset", "h-3.5 w-3.5 text-muted")}
          {u.role}
        </span>
      ),
    },
    { key: "department", label: "Department", cell: (u) => u.department_name ?? "—" },
    {
      key: "is_active",
      label: "Active",
      width: "7rem",
      cell: (u) => <StatusChip status={u.is_active ? "active" : "inactive"} label={u.is_active ? "Active" : "Inactive"} renderIcon={renderIcon} />,
    },
    {
      key: "last_login_at",
      label: "Last login",
      cell: (u) => <span className="num text-muted">{formatLastLogin(u.last_login_at)}</span>,
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      width: "12rem",
      cell: (u) => (
        <span className="inline-flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={renderIcon("pencil-line", "h-3.5 w-3.5")}
            onClick={(e) => {
              e.stopPropagation();
              openEdit(u);
            }}
          >
            Edit role
          </Button>
          {u.is_active ? (
            <Button
              variant="ghost"
              size="sm"
              icon={renderIcon("user-x", "h-3.5 w-3.5")}
              onClick={(e) => {
                e.stopPropagation();
                onDeactivate(u);
              }}
            >
              Deactivate
            </Button>
          ) : null}
        </span>
      ),
    },
  ];

  const state: DataState = users.error
    ? "error"
    : users.loading && !users.data
      ? "loading"
      : rows.length === 0
        ? "empty"
        : "ready";

  const openCreate = useCallback(() => {
    setForm({ email: "", password: "", full_name: "", role: "receptionist", department_id: "", specialisation: "" });
    setFormError(null);
    setCreateOpen(true);
  }, []);

  const onCreate = useCallback(async () => {
    if (!form.email.trim() || !form.full_name.trim() || form.password.length < 8) {
      setFormError("Email, full name and a password of at least 8 characters are required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api.post("/auth/users", {
        name: form.full_name,
        email: form.email.trim(),
        role: form.role,
        dept: form.department_id ? (depts.data?.departments.find((d) => String(d.id) === form.department_id)?.code ?? undefined) : undefined,
      });
      invalidateQueries(queryKeys.users() as unknown as unknown[]);
      setCreateOpen(false);
      toast({ tone: "success", message: `User ${form.full_name} invited` });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not create the user.");
    } finally {
      setSaving(false);
    }
  }, [form, depts.data, toast]);

  const openEdit = useCallback((u: AdminUser) => {
    setEditUser(u);
    setForm({
      email: u.email,
      password: "",
      full_name: u.full_name,
      role: u.role,
      department_id: u.department_id != null ? String(u.department_id) : "",
      specialisation: u.specialisation ?? "",
    });
    setFormError(null);
  }, []);

  const onEdit = useCallback(async () => {
    if (!editUser) return;
    setSaving(true);
    setFormError(null);
    try {
      await api.patch(`/admin/users/${editUser.id}`, {
        role: form.role,
        department_id: form.department_id ? Number(form.department_id) : null,
        specialisation: form.specialisation || undefined,
      });
      invalidateQueries(queryKeys.users() as unknown as unknown[], queryKeys.user(editUser.id) as unknown as unknown[]);
      setEditUser(null);
      toast({ tone: "success", message: `Role updated for ${editUser.full_name}` });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not update the user.");
    } finally {
      setSaving(false);
    }
  }, [editUser, form, toast]);

  const onDeactivate = useCallback(
    async (u: AdminUser) => {
      try {
        await api.post(`/admin/users/${u.id}/deactivate`);
        invalidateQueries(queryKeys.users() as unknown as unknown[], queryKeys.user(u.id) as unknown as unknown[]);
        toast({ tone: "info", message: `${u.full_name} deactivated`, detail: "They can no longer sign in." });
      } catch (e) {
        toast({ tone: "danger", message: "Could not deactivate", detail: e instanceof Error ? e.message : "Unknown error" });
      }
    },
    [toast],
  );

  const deptOptions = useMemo(
    () => [
      { label: "No department", value: "" },
      ...(depts.data?.departments ?? []).map((d) => ({ label: `${d.code} — ${d.name}`, value: String(d.id) })),
    ],
    [depts.data],
  );

  return (
    <div className="space-y-4 p-4 lg:p-6" data-testid="admin-users">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="mt-1 text-base text-muted">
            {rows.length > 0 ? `${rows.length} staff accounts` : "Manage staff accounts and roles"}
          </p>
        </div>
        <Button
          variant="primary"
          icon={renderIcon("user-plus", "h-4 w-4")}
          onClick={openCreate}
          data-testid="new-user"
        >
          New user
        </Button>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-52">
          <Field
            id="user-role-filter"
            label="Role"
            type="select"
            options={[{ label: "All roles", value: "" }, ...ROLE_OPTIONS]}
            value={roleFilter}
            onChange={(v) => setRoleFilter(v)}
            renderIcon={renderIcon}
          />
        </div>
        <div className="w-48">
          <Field
            id="user-active-filter"
            label="Status"
            type="select"
            options={[
              { label: "All", value: "" },
              { label: "Active", value: "active" },
              { label: "Inactive", value: "inactive" },
            ]}
            value={activeFilter}
            onChange={(v) => setActiveFilter(v)}
            renderIcon={renderIcon}
          />
        </div>
      </div>

      <StateRegion
        state={state}
        loading={<SkeletonRows rows={6} columns={6} />}
        empty={
          <div className="card !p-0">
            <EmptyState
              icon="users"
              title="No users match these filters"
              body="Adjust the role or status filter, or invite a new staff member."
              action={
                <Button variant="primary" onClick={openCreate}>
                  New user
                </Button>
              }
              renderIcon={renderIcon}
            />
          </div>
        }
        error={
          <div className="card !p-0">
            <ErrorState
              title="Could not load users"
              body={users.error?.message ?? "The user directory did not respond."}
              onRetry={users.refetch}
              renderIcon={renderIcon}
            />
          </div>
        }
        ready={
          <div className="card overflow-hidden !p-0">
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(u) => String(u.id)}
              label="Users"
              caption="Staff accounts and their roles"
              rowLabel={(u) => u.full_name}
              renderIcon={renderIcon}
              mobileCard={(u) => (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 font-medium">{u.full_name}</span>
                  <span className="capitalize text-muted">{u.role}</span>
                  <StatusChip status={u.is_active ? "active" : "inactive"} label={u.is_active ? "Active" : "Inactive"} renderIcon={renderIcon} />
                </div>
              )}
              footer={
                <div className="flex flex-wrap items-center gap-2">
                  <span>{rows.length} user{rows.length === 1 ? "" : "s"}</span>
                </div>
              }
            />
          </div>
        }
      />

      {/* Create user */}
      <Dialog
        open={createOpen}
        title="New user"
        size="md"
        onClose={() => setCreateOpen(false)}
        renderIcon={renderIcon}
        actions={[
          { label: "Cancel", variant: "ghost" },
          {
            label: "Create user",
            variant: "primary",
            icon: "user-plus",
            onAction: () => {
              void onCreate();
              return false;
            },
          },
        ]}
      >
        <div className="space-y-4" data-testid="new-user-form">
          <Field
            id="nu-email"
            label="Email"
            type="email"
            value={form.email}
            onChange={(v) => setForm((f) => ({ ...f, email: v }))}
            required
            renderIcon={renderIcon}
          />
          <Field
            id="nu-password"
            label="Password"
            type="password"
            value={form.password}
            onChange={(v) => setForm((f) => ({ ...f, password: v }))}
            help="At least 8 characters."
            required
            renderIcon={renderIcon}
          />
          <Field
            id="nu-full-name"
            label="Full name"
            type="text"
            value={form.full_name}
            onChange={(v) => setForm((f) => ({ ...f, full_name: v }))}
            required
            renderIcon={renderIcon}
          />
          <Field
            id="nu-role"
            label="Role"
            type="select"
            options={ROLE_OPTIONS}
            value={form.role}
            onChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}
            renderIcon={renderIcon}
          />
          <Field
            id="nu-dept"
            label="Department"
            type="select"
            options={deptOptions}
            value={form.department_id}
            onChange={(v) => setForm((f) => ({ ...f, department_id: v }))}
            optional
            renderIcon={renderIcon}
          />
          <Field
            id="nu-spec"
            label="Specialisation"
            type="text"
            value={form.specialisation}
            onChange={(v) => setForm((f) => ({ ...f, specialisation: v }))}
            optional
            help="For doctors, e.g. Interventional Cardiology."
            renderIcon={renderIcon}
          />
          {formError ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {formError}
            </p>
          ) : null}
          {saving ? (
            <p className="text-sm text-muted" role="status">
              Creating user…
            </p>
          ) : null}
        </div>
      </Dialog>

      {/* Edit role */}
      <Dialog
        open={editUser !== null}
        title={`Edit ${editUser?.full_name ?? "user"}`}
        size="md"
        onClose={() => setEditUser(null)}
        renderIcon={renderIcon}
        actions={[
          { label: "Cancel", variant: "ghost" },
          {
            label: "Save changes",
            variant: "primary",
            icon: "check",
            onAction: () => {
              void onEdit();
              return false;
            },
          },
        ]}
      >
        <div className="space-y-4">
          <Field
            id="eu-role"
            label="Role"
            type="select"
            options={ROLE_OPTIONS}
            value={form.role}
            onChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}
            renderIcon={renderIcon}
          />
          <Field
            id="eu-dept"
            label="Department"
            type="select"
            options={deptOptions}
            value={form.department_id}
            onChange={(v) => setForm((f) => ({ ...f, department_id: v }))}
            optional
            renderIcon={renderIcon}
          />
          <Field
            id="eu-spec"
            label="Specialisation"
            type="text"
            value={form.specialisation}
            onChange={(v) => setForm((f) => ({ ...f, specialisation: v }))}
            optional
            renderIcon={renderIcon}
          />
          {formError ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {formError}
            </p>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}