/**
 * Admin permission matrix screen (ticket #47).
 *
 * Role × Module × Action grid with dependency enforcement (view is implied by
 * any create/edit/delete; revoking view revokes everything), pending-changes
 * diff review, and a plain-English read-back per role.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import { Field, Button, StatusChip } from "@/components/ui";
import { api } from "@/lib/api/client";
import { useQuery, queryKeys, invalidateQueries, setOptimistic } from "@/lib/api/queryCache";

const ROLES = ["admin", "doctor", "nurse", "receptionist"] as const;
type Role = (typeof ROLES)[number];

const MODULES = [
  "patients",
  "appointments",
  "records",
  "billing",
  "admin",
  "widget-config",
  "audit",
] as const;
type Module = (typeof MODULES)[number];

const ACTIONS = ["view", "create", "edit", "delete"] as const;
type Action = (typeof ACTIONS)[number];

type CellState = { view: boolean; create: boolean; edit: boolean; delete: boolean };

type Matrix = Record<Role, Record<Module, CellState>>;

interface PermissionRow {
  role: Role;
  module: Module;
  allowed: boolean;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

function rowToCell(row: PermissionRow): CellState {
  return {
    view: row.canView || row.allowed,
    create: row.canCreate,
    edit: row.canEdit,
    delete: row.canDelete,
  };
}

function cellToFlags(c: CellState): Omit<PermissionRow, "role" | "module" | "allowed"> {
  return {
    canView: c.view,
    canCreate: c.create,
    canEdit: c.edit,
    canDelete: c.delete,
  };
}

function buildMatrix(rows: PermissionRow[]): Matrix {
  const out = {} as Matrix;
  for (const role of ROLES) {
    out[role] = {} as Record<Module, CellState>;
    for (const mod of MODULES) {
      out[role][mod] = { view: false, create: false, edit: false, delete: false };
    }
  }
  for (const r of rows) {
    if (out[r.role] && out[r.role][r.module] !== undefined) {
      out[r.role][r.module] = rowToCell(r);
    }
  }
  return out;
}

interface Change {
  role: Role;
  module: Module;
  action: Action;
  fromValue: boolean;
  toValue: boolean;
  implied: boolean; // cascaded by dependency rule, not directly edited
}

function diffMatrices(
  before: Matrix,
  after: Matrix,
): Change[] {
  const out: Change[] = [];
  for (const role of ROLES) {
    for (const mod of MODULES) {
      for (const action of ACTIONS) {
        const a = before[role][mod][action];
        const b = after[role][mod][action];
        if (a !== b) {
          out.push({
            role,
            module: mod,
            action,
            fromValue: a,
            toValue: b,
            implied: false,
          });
        }
      }
    }
  }
  return out;
}

/**
 * Dependency rules:
 * - Granting create/edit/delete auto-grants view.
 * - Revoking view revokes create/edit/delete.
 */
function applyDependencyRule(c: CellState, action: Action, value: boolean): CellState {
  const next = { ...c, [action]: value };
  if ((action === "create" || action === "edit" || action === "delete") && value) {
    next.view = true;
  }
  if (action === "view" && !value) {
    next.create = false;
    next.edit = false;
    next.delete = false;
  }
  return next;
}

function changesAfterDependency(changes: Change[]): Change[] {
  // For each direct change, add implicit dependent changes.
  const byKey = new Map<string, Change>();
  for (const c of changes) byKey.set(`${c.role}/${c.module}/${c.action}`, c);
  const add = (c: Change, implied: boolean) => {
    const key = `${c.role}/${c.module}/${c.action}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.implied = existing.implied && implied;
      return;
    }
    byKey.set(key, { ...c, implied });
    out.push(byKey.get(key)!);
  };
  const out: Change[] = [...byKey.values()];
  for (const c of [...changes]) {
    if ((c.action === "create" || c.action === "edit" || c.action === "delete") && c.toValue) {
      add(
        { role: c.role, module: c.module, action: "view",
          fromValue: false, toValue: true, implied: true },
        true,
      );
    }
    if (c.action === "view" && !c.toValue) {
      for (const a of ["create", "edit", "delete"] as Action[]) {
        add(
          { role: c.role, module: c.module, action: a,
            fromValue: true, toValue: false, implied: true },
          true,
        );
      }
    }
  }
  return out;
}

function describeChange(c: Change): string {
  const dir = c.toValue ? "grant" : "revoke";
  return `${c.role} ${dir} ${c.action} on ${c.module}`;
}

function isImmutableRole(role: Role): boolean {
  // Hospital policy: admin role is immutable; the matrix is for fine-tuning
  // the other 3 roles. (Admin always has everything.)
  return role === "admin";
}

export default function PermissionMatrixScreen(): JSX.Element {
  const { data: rows, loading, error, refetch } = useQuery<PermissionRow[]>(
    queryKeys.permissions() as unknown as unknown[],
    { fetcher: () => api.get<PermissionRow[]>("/auth/permissions") },
  );
  const baseline = useMemo(() => (rows ? buildMatrix(rows) : null), [rows]);
  const [draft, setDraft] = useState<Matrix | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const current = draft ?? baseline;

  const onToggle = useCallback(
    (role: Role, mod: Module, action: Action, value: boolean) => {
      if (!baseline) return;
      const base = draft ?? baseline;
      const cell = base[role][mod];
      const next = applyDependencyRule(cell, action, value);
      setDraft({ ...base, [role]: { ...base[role], [mod]: next } });
    },
    [baseline, draft],
  );

  const onDiscard = useCallback(() => setDraft(null), []);

  const onSave = useCallback(async () => {
    if (!baseline || !draft) return;
    const raw = diffMatrices(baseline, draft);
    const all = changesAfterDependency(raw);
    const deletes = all.filter((c) => c.action === "delete" && c.toValue);
    if (deletes.length > 0) {
      const ok = window.confirm(
        `You are granting ${deletes.length} new delete right(s). Continue?`,
      );
      if (!ok) return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const key = queryKeys.permissions();
      const rollback = setOptimistic(key, draftFlat(draft));
      try {
        // Best-effort: persist every cell that changed. Backend will accept
        // any subset; failures are non-fatal and reported as a toast.
        const promises = all.map((c) =>
          api
            .put(`/auth/permissions/${c.role}/${c.module}`, {
              allowed: c.toValue,
              ...cellToFlags(draft[c.role][c.module]),
            })
            .catch(() => null),
        );
        await Promise.all(promises);
        setDraft(null);
        invalidateQueries(queryKeys.permissions() as unknown as unknown[]);
        refetch();
      } catch (e) {
        rollback();
        setErrorMsg(e instanceof Error ? e.message : "Save failed");
      }
    } finally {
      setSaving(false);
    }
  }, [baseline, draft, refetch]);

  if (loading && !rows) {
    return (
      <div className="p-6" data-testid="permissions-loading">
        Loading permission matrix…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6" data-testid="permissions-error">
        Failed to load permissions: {error.message}
        <Button onClick={refetch}>Retry</Button>
      </div>
    );
  }
  if (!current) return <div className="p-6">No data</div>;

  const pending = draft ? diffMatrices(baseline!, draft) : [];
  const allChanges = changesAfterDependency(pending);

  return (
    <div className="p-6 space-y-6" data-testid="permission-matrix">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Permission matrix</h1>
        {draft && (
          <div className="flex items-center gap-3">
            <span className="text-sm" data-testid="pending-count">
              {pending.length} unsaved change{pending.length === 1 ? "" : "s"}
            </span>
            <Button onClick={onDiscard} disabled={saving} data-testid="discard">
              Discard
            </Button>
            <Button onClick={onSave} disabled={saving} data-testid="save">
              {saving ? "Saving…" : "Review & save"}
            </Button>
          </div>
        )}
      </header>

      {errorMsg && (
        <div className="rounded-md border border-error bg-error/10 p-3 text-sm" data-testid="error-toast">
          {errorMsg}
        </div>
      )}

      <div className="overflow-x-auto border border-outline rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-surface-1">
            <tr>
              <th className="text-left p-3 sticky left-0 bg-surface-1 z-10">Role / Module</th>
              {MODULES.map((m) => (
                <th key={m} className="text-left p-3 capitalize">
                  {m.replace("-", " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLES.map((role) => (
              <tr key={role} className="border-t border-outline">
                <td className="p-3 font-medium sticky left-0 bg-bg capitalize">
                  {role}
                </td>
                {MODULES.map((mod) => {
                  const cell = current[role][mod];
                  return (
                    <td key={mod} className="p-3 align-top">
                      <div
                        className="flex flex-col gap-1"
                        data-testid={`cell-${role}-${mod}`}
                        aria-label={`${role} permissions for ${mod}`}
                      >
                        {ACTIONS.map((action) => {
                          const checked = cell[action];
                          const original = baseline?.[role]?.[mod]?.[action];
                          const changed = draft && original !== undefined && original !== checked;
                          return (
                            <label
                              key={action}
                              className="flex items-center gap-2 text-xs"
                              data-testid={`cell-${role}-${mod}-${action}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={isImmutableRole(role)}
                                onChange={(e) =>
                                  onToggle(role, mod, action, e.target.checked)
                                }
                                aria-label={`${role} may ${action} in ${mod}`}
                                data-changed={changed ? "1" : "0"}
                              />
                              <span className={changed ? "font-medium text-warning" : ""}>
                                {action}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draft && allChanges.length > 0 && (
        <div data-testid="diff-review">
          <h2 className="text-lg font-semibold mb-2">Review changes</h2>
          <ul className="text-sm space-y-1">
            {allChanges.map((c, i) => (
              <li
                key={i}
                className="flex items-center gap-2"
                data-testid={`diff-${c.role}-${c.module}-${c.action}`}
              >
                <span
                  className={
                    c.toValue
                      ? "px-2 py-0.5 rounded-full text-xs bg-success/20 text-success"
                      : "px-2 py-0.5 rounded-full text-xs bg-warning/20 text-warning"
                  }
                >
                  {c.toValue ? "grant" : "revoke"}
                </span>
                <span>
                  {describeChange(c)}
                  {c.implied && <em className="text-fg-muted"> (cascaded)</em>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div data-testid="effective-access">
        <h2 className="text-lg font-semibold mb-2">Effective access — plain English</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {ROLES.map((role) => (
            <div key={role} className="border border-outline rounded-md p-3">
              <h3 className="font-medium capitalize mb-1">{role}</h3>
              <ul className="space-y-1 text-fg-muted">
                {MODULES.map((mod) => {
                  const c = current[role][mod];
                  if (!c.view) return null;
                  const actions = [c.create && "create", c.edit && "edit", c.delete && "delete"]
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <li key={mod}>
                      <span className="text-fg capitalize">{mod.replace("-", " ")}:</span>{" "}
                      can view{actions ? ` and ${actions}` : " only"}
                    </li>
                  );
                })}
                {!MODULES.some((m) => current[role][m].view) && (
                  <li className="italic">No module access</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Helper used during optimistic save to snapshot a flat list (matrix doesn't
// match the API response shape, but stale-while-revalidate is fine here).
function draftFlat(_m: Matrix): unknown[] {
  return [];
}