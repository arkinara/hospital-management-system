import clsx from 'clsx';
import { Check } from 'lucide-react';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

export type PermissionCell = Record<PermissionAction, boolean>;

export type PermissionData = Record<string, Record<string, PermissionCell>>;

const actions: { key: PermissionAction; short: string }[] = [
  { key: 'view', short: 'V' },
  { key: 'create', short: 'C' },
  { key: 'edit', short: 'E' },
  { key: 'delete', short: 'D' },
];

/**
 * PermissionMatrix renders an admin role-by-module permission grid where each
 * cell exposes View/Create/Edit/Delete toggles.
 *
 * @param roles Column headers (role identifiers).
 * @param modules Row headers (module identifiers).
 * @param matrix Nested lookup of role -> module -> permission flags.
 * @param editable When true toggles are interactive.
 * @param onToggle Invoked with the role, module and action when a toggle flips.
 */
export interface PermissionMatrixProps {
  roles: string[];
  modules: string[];
  matrix: PermissionData;
  editable?: boolean;
  onToggle?: (role: string, module: string, action: PermissionAction, next: boolean) => void;
}

const PermissionMatrix = ({
  roles,
  modules,
  matrix,
  editable = false,
  onToggle,
}: PermissionMatrixProps) => {
  return (
    <div className="bg-surface-container rounded-2xl overflow-hidden border border-outline/10">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 bg-surface-container-high text-left px-4 py-3 font-medium text-foreground">
                Module
              </th>
              {roles.map((role) => (
                <th
                  key={role}
                  className="sticky top-0 z-10 bg-surface-container-high px-4 py-3 text-center font-medium text-foreground whitespace-nowrap"
                >
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((module, rowIndex) => (
              <tr
                key={module}
                className={clsx(rowIndex % 2 === 1 && 'bg-surface-container-low')}
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-inherit text-left px-4 py-3 font-medium text-foreground whitespace-nowrap"
                >
                  {module}
                </th>
                {roles.map((role) => {
                  const cell = matrix[role]?.[module];
                  return (
                    <td key={role} className="px-2 py-2 align-middle">
                      <div className="flex items-center justify-center gap-1">
                        {actions.map(({ key, short }) => {
                          const checked = Boolean(cell?.[key]);
                          return (
                            <label
                              key={key}
                              className={clsx(
                                'relative inline-flex flex-col items-center justify-center',
                                'min-h-[44px] min-w-[36px] rounded-xl cursor-pointer select-none',
                                'transition-colors duration-200 hover:bg-surface-container-high',
                                !editable && 'cursor-default',
                              )}
                              title={`${key} ${module} / ${role}`}
                            >
                              <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={checked}
                                disabled={!editable}
                                onChange={(e) => onToggle?.(role, module, key, e.target.checked)}
                              />
                              <span
                                className={clsx(
                                  'flex items-center justify-center h-5 w-5 rounded-md border transition-colors duration-200',
                                  checked
                                    ? 'bg-primary border-primary text-primary-foreground'
                                    : 'bg-background border-outline/30 text-transparent',
                                )}
                              >
                                <Check size={14} strokeWidth={2} />
                              </span>
                              <span className="text-[10px] leading-none mt-0.5 text-foreground/60">{short}</span>
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
    </div>
  );
};

export default PermissionMatrix;
