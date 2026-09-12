"use client";

import React, { useCallback, useState } from "react";
import {
  Button,
  ConfirmDialog,
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
import { api, ApiError } from "@/lib/api/client";
import { useQuery, queryKeys, invalidateQueries } from "@/lib/api/queryCache";
import type { Role, WidgetDefinition, WidgetSize } from "@/lib/fixtures";

const ROLE_OPTIONS: Array<{ label: string; value: Role }> = [
  { label: "Admin", value: "admin" },
  { label: "Doctor", value: "doctor" },
  { label: "Nurse", value: "nurse" },
  { label: "Receptionist", value: "receptionist" },
];

const SIZE_OPTIONS: Array<{ label: string; value: WidgetSize }> = [
  { label: "Small", value: "sm" },
  { label: "Medium", value: "md" },
  { label: "Large", value: "lg" },
];

function WidgetLibraryScreen() {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    key: "",
    name: "",
    desc: "",
    icon: "",
    default_role: "doctor" as Role,
    size: "md" as WidgetSize,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [disableTarget, setDisableTarget] = useState<WidgetDefinition | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<WidgetDefinition | null>(null);

  const library = useQuery<{ widgets: WidgetDefinition[] }>(queryKeys.widgetDefinitions(), {
    fetcher: () => api.get<{ widgets: WidgetDefinition[] }>("/widget-config/widgets"),
  });

  const rows = library.data?.widgets ?? [];

  const state: DataState = library.error
    ? "error"
    : library.loading && !library.data
      ? "loading"
      : rows.length === 0
        ? "empty"
        : "ready";

  const refresh = useCallback(() => {
    invalidateQueries(queryKeys.widgetLibrary() as unknown as unknown[]);
    library.refetch();
  }, [library.refetch]);

  const toggleEnabled = useCallback(
    async (w: WidgetDefinition) => {
      if (w.globally_enabled && w.globally_locked) {
        setDisableTarget(w);
        return;
      }
      try {
        await api.patch(`/admin/widgets/${w.key}`, { globally_enabled: !w.globally_enabled });
        refresh();
        toast({ tone: "success", message: `${w.name} ${w.globally_enabled ? "disabled" : "enabled"} globally` });
      } catch (e) {
        toast({ tone: "danger", message: "Could not update widget", detail: e instanceof Error ? e.message : "Unknown error" });
      }
    },
    [refresh, toast],
  );

  const confirmDisable = useCallback(async () => {
    if (!disableTarget) return;
    try {
      await api.patch(`/admin/widgets/${disableTarget.key}`, { globally_enabled: false });
      refresh();
      toast({
        tone: "success",
        message: `${disableTarget.name} disabled globally`,
        detail: "It was also unlocked so the state stays consistent.",
      });
      setDisableTarget(null);
    } catch (e) {
      toast({ tone: "danger", message: "Could not disable widget", detail: e instanceof Error ? e.message : "Unknown error" });
    }
  }, [disableTarget, refresh, toast]);

  const toggleLock = useCallback(
    async (w: WidgetDefinition) => {
      if (w.globally_locked) {
        setUnlockTarget(w);
        return;
      }
      if (!w.globally_enabled) {
        toast({ tone: "warning", message: "Cannot lock a disabled widget", detail: "Enable it globally first, then lock." });
        return;
      }
      try {
        await api.patch(`/widget-config/widgets/${w.key}/lock`, { locked: true });
        refresh();
        toast({ tone: "success", message: `${w.name} locked`, detail: "Users can no longer remove it from their dashboards." });
      } catch (e) {
        if (e instanceof ApiError && e.status === 422) {
          toast({ tone: "warning", message: "Cannot lock a disabled widget", detail: "Enable it globally first, then lock." });
        } else {
          toast({ tone: "danger", message: "Could not lock widget", detail: e instanceof Error ? e.message : "Unknown error" });
        }
      }
    },
    [refresh, toast],
  );

  const confirmUnlock = useCallback(async () => {
    if (!unlockTarget) return;
    try {
      await api.patch(`/widget-config/widgets/${unlockTarget.key}/lock`, { locked: false });
      refresh();
      toast({ tone: "success", message: `${unlockTarget.name} unlocked`, detail: "Users can now remove it if they want." });
      setUnlockTarget(null);
    } catch (e) {
      toast({ tone: "danger", message: "Could not unlock widget", detail: e instanceof Error ? e.message : "Unknown error" });
    }
  }, [unlockTarget, refresh, toast]);

  const changeRole = useCallback(
    async (w: WidgetDefinition, role: Role) => {
      try {
        await api.patch(`/admin/widgets/${w.key}`, { default_role: role });
        refresh();
        toast({ tone: "success", message: `${w.name} default role → ${role}` });
      } catch (e) {
        toast({ tone: "danger", message: "Could not update default role", detail: e instanceof Error ? e.message : "Unknown error" });
      }
    },
    [refresh, toast],
  );

  const openAdd = useCallback(() => {
    setForm({ key: "", name: "", desc: "", icon: "", default_role: "doctor", size: "md" });
    setFormError(null);
    setAddOpen(true);
  }, []);

  const onCreate = useCallback(async () => {
    if (!form.key.trim() || !form.name.trim()) {
      setFormError("A widget key and display name are required.");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(form.key.trim())) {
      setFormError("Key must be lowercase letters, digits and hyphens only.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api.post("/admin/widgets", {
        key: form.key.trim(),
        name: form.name.trim(),
        desc: form.desc.trim() || undefined,
        icon: form.icon.trim() || undefined,
        default_role: form.default_role,
        size: form.size,
        globally_enabled: true,
      });
      refresh();
      setAddOpen(false);
      toast({ tone: "success", message: `${form.name.trim()} added to the library` });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setFormError("A widget with this key already exists.");
      } else {
        setFormError(e instanceof Error ? e.message : "Could not add the widget.");
      }
    } finally {
      setSaving(false);
    }
  }, [form, refresh, toast]);

  const columns: Column<WidgetDefinition>[] = [
    {
      key: "name",
      label: "Widget",
      cell: (w) => (
        <span className="inline-flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-container text-primary-container-foreground">
            {renderIcon(w.icon || "layout-grid", "h-4 w-4")}
          </span>
          <span>
            <span className="block font-medium">{w.name}</span>
            <span className="num block text-2xs text-subtle">{w.key}</span>
          </span>
        </span>
      ),
    },
    {
      key: "default_role",
      label: "Default role",
      width: "11rem",
      cell: (w) => (
        <select
          aria-label={`Default role for ${w.name}`}
          value={w.default_role ?? ""}
          onChange={(e) => changeRole(w, e.currentTarget.value as Role)}
          className="h-9 cursor-pointer rounded-lg border border-outline-strong bg-surface-0 px-2 text-base capitalize"
        >
          <option value="" disabled>
            None
          </option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "globally_enabled",
      label: "Globally enabled",
      width: "9rem",
      cell: (w) => (
        <button
          type="button"
          role="switch"
          aria-checked={w.globally_enabled}
          aria-label={`Globally enable ${w.name}`}
          onClick={() => toggleEnabled(w)}
          className={`press relative inline-flex h-8 w-14 items-center rounded-full border transition ${
            w.globally_enabled ? "justify-end border-transparent bg-primary" : "justify-start border-outline-strong bg-surface-2"
          }`}
          data-testid={`toggle-enabled-${w.key}`}
        >
          <span className={`grid h-6 w-6 place-items-center rounded-full ${w.globally_enabled ? "bg-primary-foreground" : "bg-muted"}`}>
            {w.globally_enabled ? renderIcon("check", "h-3.5 w-3.5") : renderIcon("x", "h-3.5 w-3.5")}
          </span>
        </button>
      ),
    },
    {
      key: "globally_locked",
      label: "Locked",
      width: "9rem",
      cell: (w) => (
        <button
          type="button"
          role="switch"
          aria-checked={w.globally_locked}
          aria-label={`Lock ${w.name}`}
          onClick={() => toggleLock(w)}
          disabled={!w.globally_enabled}
          title={!w.globally_enabled ? "Enable the widget before locking it" : undefined}
          className={`press relative inline-flex h-8 w-14 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40 ${
            w.globally_locked ? "justify-end border-transparent bg-accent" : "justify-start border-outline-strong bg-surface-2"
          }`}
          data-testid={`toggle-lock-${w.key}`}
        >
          <span className={`grid h-6 w-6 place-items-center rounded-full ${w.globally_locked ? "bg-accent-foreground" : "bg-muted"}`}>
            {renderIcon(w.globally_locked ? "lock" : "lock-open", "h-3.5 w-3.5")}
          </span>
        </button>
      ),
    },
    {
      key: "size",
      label: "Size",
      width: "7rem",
      cell: (w) => <span className="uppercase text-muted">{w.size}</span>,
    },
  ];

  return (
    <div className="space-y-4 p-4 lg:p-6" data-testid="widget-library">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Widget library</h1>
          <p className="mt-1 text-base text-muted">
            {rows.length > 0 ? `${rows.length} widget types` : "Control which widgets exist hospital-wide"}
          </p>
        </div>
        <Button variant="primary" icon={renderIcon("plus", "h-4 w-4")} onClick={openAdd} data-testid="add-widget">
          Add widget
        </Button>
      </header>

      <StateRegion
        state={state}
        loading={<SkeletonRows rows={8} columns={5} />}
        empty={
          <div className="card !p-0">
            <EmptyState
              icon="layout-grid"
              title="No widgets in the library"
              body="Add the first widget type to make it available on dashboards."
              action={
                <Button variant="primary" onClick={openAdd}>
                  Add widget
                </Button>
              }
              renderIcon={renderIcon}
            />
          </div>
        }
        error={
          <div className="card !p-0">
            <ErrorState
              title="Could not load the widget library"
              body={library.error?.message ?? "The widget configuration service did not respond."}
              onRetry={library.refetch}
              renderIcon={renderIcon}
            />
          </div>
        }
        ready={
          <div className="card overflow-hidden !p-0">
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(w) => w.key}
              label="Widget library"
              caption="Widget types, their default roles and global governance flags"
              rowLabel={(w) => w.name}
              renderIcon={renderIcon}
              mobileCard={(w) => (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 font-medium">{w.name}</span>
                  <StatusChip
                    status={w.globally_enabled ? "active" : "inactive"}
                    label={w.globally_enabled ? "Enabled" : "Disabled"}
                    renderIcon={renderIcon}
                  />
                  {w.globally_locked ? <StatusChip status="blocked" label="Locked" renderIcon={renderIcon} /> : null}
                </div>
              )}
            />
          </div>
        }
      />

      {/* Add widget */}
      <Dialog
        open={addOpen}
        title="Add widget"
        size="md"
        onClose={() => setAddOpen(false)}
        renderIcon={renderIcon}
        actions={[
          { label: "Cancel", variant: "ghost" },
          {
            label: "Add widget",
            variant: "primary",
            icon: "plus",
            onAction: () => {
              void onCreate();
              return false;
            },
          },
        ]}
      >
        <div className="space-y-4" data-testid="add-widget-form">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="w-key"
              label="Key"
              type="text"
              value={form.key}
              onChange={(v) => setForm((f) => ({ ...f, key: v }))}
              placeholder="e.g. lab-results"
              help="Lowercase letters, digits and hyphens."
              required
              renderIcon={renderIcon}
            />
            <Field
              id="w-name"
              label="Display name"
              type="text"
              value={form.name}
              onChange={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="e.g. Lab Results"
              required
              renderIcon={renderIcon}
            />
          </div>
          <Field
            id="w-desc"
            label="Description"
            type="textarea"
            rows={2}
            value={form.desc}
            onChange={(v) => setForm((f) => ({ ...f, desc: v }))}
            placeholder="What this widget shows…"
            optional
            renderIcon={renderIcon}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="w-icon"
              label="Icon"
              type="text"
              value={form.icon}
              onChange={(v) => setForm((f) => ({ ...f, icon: v }))}
              placeholder="e.g. flask-conical"
              optional
              renderIcon={renderIcon}
            />
            <Field
              id="w-size"
              label="Size"
              type="select"
              options={SIZE_OPTIONS}
              value={form.size}
              onChange={(v) => setForm((f) => ({ ...f, size: v as WidgetSize }))}
              renderIcon={renderIcon}
            />
          </div>
          <Field
            id="w-role"
            label="Default role"
            type="select"
            options={ROLE_OPTIONS}
            value={form.default_role}
            onChange={(v) => setForm((f) => ({ ...f, default_role: v as Role }))}
            help="Which role gets this widget on a fresh dashboard."
            renderIcon={renderIcon}
          />
          {formError ? (
            <p role="alert" className="rounded-lg border border-danger/50 bg-danger-container p-2.5 text-base font-medium text-danger-container-foreground">
              {formError}
            </p>
          ) : null}
          {saving ? (
            <p role="status" className="text-sm text-muted">
              Adding widget…
            </p>
          ) : null}
        </div>
      </Dialog>

      {/* Disable a locked widget: one confirmed disable-and-unlock action */}
      <ConfirmDialog
        open={disableTarget !== null}
        title={`Disable ${disableTarget?.name ?? "this widget"}?`}
        message="This widget is locked, so disabling it also unlocks it."
        consequences={[
          "No user will see it on their default dashboard.",
          "It will be unlocked, so it may reappear if a user adds it manually.",
        ]}
        confirmLabel="Disable and unlock"
        tone="warning"
        onConfirm={() => void confirmDisable()}
        onClose={() => setDisableTarget(null)}
        renderIcon={renderIcon}
      />

      {/* Unlock: explicit confirm, never one click */}
      <ConfirmDialog
        open={unlockTarget !== null}
        title={`Unlock ${unlockTarget?.name ?? "this widget"}?`}
        message="After unlocking, users can remove this widget from their own dashboards."
        confirmLabel="Unlock"
        tone="warning"
        onConfirm={() => void confirmUnlock()}
        onClose={() => setUnlockTarget(null)}
        renderIcon={renderIcon}
      />
    </div>
  );
}

export default function WidgetLibraryPage() {
  return (
    <ToastProvider renderIcon={renderIcon}>
      <WidgetLibraryScreen />
    </ToastProvider>
  );
}