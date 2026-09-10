import React from 'react';
import { cn } from './cn';
import {
  ACTION_FLAG,
  can,
  type ModuleName,
  type PermissionAction,
  type PermissionMatrixData,
  type Role,
} from './tokens';
import type { IconRenderer } from './StatusChip';

const ACTIONS: { action: PermissionAction; label: string; icon: string; help: string }[] = [
  { action: 'view', label: 'View', icon: 'eye', help: 'Read records in this module' },
  { action: 'create', label: 'Create', icon: 'plus', help: 'Add new records' },
  { action: 'edit', label: 'Edit', icon: 'square-pen', help: 'Change existing records' },
  { action: 'delete', label: 'Delete', icon: 'trash-2', help: 'Remove or void records' },
];

export interface PermissionChange {
  role: Role;
  module: ModuleName;
  action: PermissionAction;
  granted: boolean;
}

export interface PermissionMatrixProps {
  /** Working copy being edited. */
  draft: PermissionMatrixData;
  /** Last saved state, used to highlight pending changes. */
  saved: PermissionMatrixData;
  modules: ModuleName[];
  /** Roles that cannot be restricted, typically `['Admin']`. */
  immutableRoles?: Role[];
  onChange: (next: PermissionMatrixData) => void;
  /** Fired when the view dependency rewrites the caller's intent. */
  onDependencyApplied?: (message: string) => void;
  renderIcon: IconRenderer;
  className?: string;
}

const MODULE_ICON: Record<string, string> = {
  Patients: 'users',
  Appointments: 'calendar-days',
  Records: 'file-text',
  Billing: 'receipt-text',
  Admin: 'shield-check',
  Reports: 'bar-chart-3',
};

/**
 * Role × module × action permission matrix.
 *
 * Design decisions worth stating:
 *
 *  - **Real checkboxes, not coloured squares.** Each cell is focusable and carries
 *    an aria-label that reads as "Nurse may create in Records", so the matrix is
 *    navigable and comprehensible without sight.
 *  - **The view dependency is enforced here.** `create`, `edit` and `delete` are
 *    meaningless without `view`, so granting one grants view, and revoking view
 *    revokes the rest. The caller is told what happened rather than silently
 *    corrected.
 *  - **Immutable roles are disabled, not hidden.** An Admin column that vanished
 *    would read as a missing feature; a locked one reads as a guard rail.
 *  - **Changed cells are tinted** so a pending edit is visible before saving, and
 *    `pendingChanges` gives the caller a diff to confirm against.
 *
 * Under `md` the caller should render the mobile fallback instead — a 25-column
 * table cannot be made to work on a phone, and shrinking it only breaks it quietly.
 */
export const PermissionMatrix: React.FC<PermissionMatrixProps> = ({
  draft,
  saved,
  modules,
  immutableRoles = ['Admin'],
  onChange,
  onDependencyApplied,
  renderIcon,
  className,
}) => {
  const roles = Object.keys(draft) as Role[];

  const changed = (role: Role, module: ModuleName, action: PermissionAction): boolean =>
    can(draft[role][module] ?? '', action) !== can(saved[role][module] ?? '', action);

  const toggle = (role: Role, module: ModuleName, action: PermissionAction) => {
    if (immutableRoles.includes(role)) return;

    const current = draft[role][module] ?? '';
    const flag = ACTION_FLAG[action];
    const turningOn = !current.includes(flag);
    let next = turningOn ? current + flag : current.replace(flag, '');

    if (turningOn && action !== 'view' && !next.includes('v')) {
      next += 'v';
      onDependencyApplied?.(`View added automatically — ${module} cannot be ${action}d without it.`);
    }
    if (!turningOn && action === 'view' && next.length > 0) {
      next = '';
      onDependencyApplied?.(`Create, edit and delete removed too — they require view access to ${module}.`);
    }

    onChange({
      ...draft,
      [role]: { ...draft[role], [module]: ['v', 'c', 'e', 'd'].filter((f) => next.includes(f)).join('') },
    });
  };

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="dt">
        <caption className="sr-only">
          Permission matrix: for each module, which of view, create, edit and delete each role may perform
        </caption>
        <thead>
          <tr>
            <th scope="col" rowSpan={2} className="align-bottom" style={{ minWidth: 150 }}>
              Module
            </th>
            {roles.map((r) => (
              <th key={r} scope="colgroup" colSpan={ACTIONS.length} className="text-center border-l border-outline">
                <span className="inline-flex items-center gap-1.5">
                  {r}
                  {immutableRoles.includes(r) ? renderIcon('lock', 'w-3 h-3') : null}
                </span>
              </th>
            ))}
          </tr>
          <tr>
            {roles.flatMap((r) =>
              ACTIONS.map((a, i) => (
                <th
                  key={`${r}-${a.action}`}
                  scope="col"
                  title={`${a.label} — ${a.help}`}
                  className={cn('text-center font-normal', i === 0 && 'border-l border-outline')}
                >
                  <span aria-hidden>{renderIcon(a.icon, 'w-3.5 h-3.5 mx-auto text-muted')}</span>
                  <span className="sr-only">
                    {r} {a.label}
                  </span>
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => (
            <tr key={m}>
              <th scope="row" className="font-medium text-left !normal-case !text-sm !tracking-normal !bg-transparent !static">
                <span className="flex items-center gap-2">
                  {renderIcon(MODULE_ICON[m] ?? 'box', 'w-4 h-4 text-muted')}
                  {m}
                </span>
              </th>
              {roles.flatMap((r) =>
                ACTIONS.map((a, i) => {
                  const locked = immutableRoles.includes(r);
                  const on = can(draft[r][m] ?? '', a.action);
                  return (
                    <td
                      key={`${r}-${m}-${a.action}`}
                      className={cn(
                        'text-center',
                        i === 0 && 'border-l border-outline',
                        changed(r, m, a.action) && 'bg-warning-container/50',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={locked}
                        onChange={() => toggle(r, m, a.action)}
                        aria-label={`${r} may ${a.label.toLowerCase()} in ${m}${locked ? ' (immutable role)' : ''}`}
                        title={`${r} · ${m} · ${a.label}${locked ? ' — cannot be restricted' : ''}`}
                        className="w-4 h-4 accent-[rgb(var(--primary))] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed align-middle"
                      />
                      {changed(r, m, a.action) ? <span className="sr-only">changed</span> : null}
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** Diff between two matrices, for the confirm-before-save step. */
export const pendingChanges = (
  draft: PermissionMatrixData,
  saved: PermissionMatrixData,
  modules: ModuleName[],
): PermissionChange[] => {
  const out: PermissionChange[] = [];
  (Object.keys(draft) as Role[]).forEach((role) =>
    modules.forEach((module) =>
      (['view', 'create', 'edit', 'delete'] as PermissionAction[]).forEach((action) => {
        const now = can(draft[role][module] ?? '', action);
        if (now !== can(saved[role][module] ?? '', action)) out.push({ role, module, action, granted: now });
      }),
    ),
  );
  return out;
};
