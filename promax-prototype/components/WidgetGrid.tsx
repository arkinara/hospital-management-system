import React from 'react';
import { cn } from './cn';
import type { IconRenderer } from './StatusChip';
import type { Role } from './tokens';

export interface WidgetDefinition {
  key: string;
  name: string;
  icon: string;
  /** Roles that receive this widget by default on first sign-in. */
  roles: Role[];
  /** Admin global enable. A disabled widget is gone from every dashboard. */
  enabled: boolean;
  /** Admin lock. Beats any per-user layout: the user cannot remove it. */
  locked: boolean;
  /** Grid span classes, e.g. `xl:col-span-2`. */
  span?: string;
  meta?: string;
  render: () => React.ReactNode;
}

export interface WidgetGridProps {
  widgets: WidgetDefinition[];
  /** Per-user widget order. Held by the caller so it can be persisted server-side. */
  order: string[];
  onReorder: (order: string[]) => void;
  onRemove: (key: string) => void;
  renderIcon: IconRenderer;
  className?: string;
}

/**
 * Configurable dashboard grid.
 *
 * Implements the three-layer resolution the PRD asks for: role defaults seed a new
 * user, the user reorders and removes freely, and an Admin lock overrides both.
 *
 * Reordering works by drag **and** by focusing a handle and pressing the arrow keys.
 * Drag-only is not an accessible control (WCAG 2.5.7), and on a ward a keyboard is
 * often faster anyway.
 *
 * Removal is expected to be reported through a toast carrying Undo — this component
 * calls `onRemove` and leaves the reversal affordance to the caller.
 */
export const WidgetGrid: React.FC<WidgetGridProps> = ({ widgets, order, onReorder, onRemove, renderIcon, className }) => {
  const [dragKey, setDragKey] = React.useState<string | null>(null);
  const [overKey, setOverKey] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState('');
  const handleRefs = React.useRef(new Map<string, HTMLButtonElement | null>());

  const byKey = (k: string) => widgets.find((w) => w.key === k);

  const move = (key: string, delta: number) => {
    const i = order.indexOf(key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    next.splice(j, 0, next.splice(i, 1)[0]);
    onReorder(next);
    setAnnouncement(`${byKey(key)?.name} moved to position ${j + 1} of ${next.length}`);
    // Keep focus on the handle so a run of arrow presses keeps working.
    requestAnimationFrame(() => handleRefs.current.get(key)?.focus());
  };

  const drop = (targetKey: string) => {
    if (!dragKey || dragKey === targetKey) return;
    const next = [...order];
    next.splice(next.indexOf(targetKey), 0, next.splice(next.indexOf(dragKey), 1)[0]);
    onReorder(next);
    setDragKey(null);
    setOverKey(null);
  };

  return (
    <>
      <div className={cn('grid gap-3 md:grid-cols-2 xl:grid-cols-4 items-start', className)}>
        {order.map((key) => {
          const w = byKey(key);
          if (!w) return null;
          return (
            <section
              key={key}
              draggable
              aria-roledescription="Draggable widget"
              aria-label={w.name}
              onDragStart={() => setDragKey(key)}
              onDragEnd={() => {
                setDragKey(null);
                setOverKey(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setOverKey(key);
              }}
              onDragLeave={() => setOverKey((k) => (k === key ? null : k))}
              onDrop={(e) => {
                e.preventDefault();
                drop(key);
              }}
              className={cn(
                'card !p-0 overflow-hidden flex flex-col',
                w.span,
                dragKey === key && 'opacity-45',
                overKey === key && dragKey && dragKey !== key && 'ring-2 ring-primary',
              )}
            >
              <header className="flex items-center gap-2 px-3.5 py-2.5 border-b border-outline bg-surface-1">
                <button
                  ref={(el) => handleRefs.current.set(key, el)}
                  type="button"
                  aria-label={`Reorder ${w.name}. Use the left and right arrow keys to move it.`}
                  title="Drag, or focus and press the arrow keys"
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      move(key, -1);
                    }
                    if (e.key === 'ArrowRight') {
                      e.preventDefault();
                      move(key, 1);
                    }
                  }}
                  className="w-8 h-8 -ml-1 shrink-0 rounded-md grid place-items-center text-subtle hover:bg-surface-3 cursor-grab active:cursor-grabbing press"
                >
                  {renderIcon('grip-vertical', 'w-4 h-4')}
                </button>

                <h3 className="flex-1 min-w-0 text-base font-semibold font-display truncate flex items-center gap-1.5">
                  {renderIcon(w.icon, 'w-4 h-4 text-muted shrink-0')}
                  <span className="truncate">{w.name}</span>
                </h3>

                {w.meta ? <span className="shrink-0 text-2xs text-muted num hidden sm:inline">{w.meta}</span> : null}

                {w.locked ? (
                  <span
                    title="Locked by Admin — you cannot remove this widget"
                    className="shrink-0 inline-flex items-center gap-1 text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-surface-3 text-muted"
                  >
                    {renderIcon('lock', 'w-3 h-3')}
                    Locked
                  </span>
                ) : null}

                <button
                  type="button"
                  disabled={w.locked}
                  onClick={() => onRemove(key)}
                  aria-label={
                    w.locked
                      ? `${w.name} is locked by Admin and cannot be removed`
                      : `Remove ${w.name} from my dashboard`
                  }
                  className="w-8 h-8 -mr-1 shrink-0 rounded-md grid place-items-center text-subtle hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed press"
                >
                  {renderIcon('x', 'w-4 h-4')}
                </button>
              </header>

              <div className="p-3.5 flex-1 min-w-0">{w.render()}</div>
            </section>
          );
        })}
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </>
  );
};
