import React from 'react';
import { cn } from './cn';
import { TONE_CONTAINER, type Tone } from './tokens';
import type { IconRenderer } from './StatusChip';

export type EntryKind = 'note' | 'vitals' | 'prescription' | 'lab' | 'admission' | 'procedure';

export const ENTRY_KIND: Record<EntryKind, { label: string; icon: string; tone: Tone }> = {
  note: { label: 'Visit note', icon: 'file-text', tone: 'info' },
  vitals: { label: 'Vitals', icon: 'activity', tone: 'success' },
  prescription: { label: 'Prescription', icon: 'pill', tone: 'primary' },
  lab: { label: 'Lab result', icon: 'flask-conical', tone: 'warning' },
  admission: { label: 'Admission', icon: 'bed-double', tone: 'warning' },
  procedure: { label: 'Procedure', icon: 'scissors', tone: 'danger' },
};

export interface TimelineEntry {
  id: string;
  /** ISO-ish local timestamp, e.g. "2026-09-09 07:42". */
  at: string;
  kind: EntryKind;
  /** Department code. Tagging is what makes the record cross-departmental. */
  department: string;
  departmentName: string;
  author: string;
  title: string;
  body: string;
  /** ICD-10 code and description, when the entry carries a diagnosis. */
  diagnosis?: string;
  flagged?: boolean;
}

export interface TimelineProps {
  entries: TimelineEntry[];
  /** Additive filter over kinds and department codes. Empty means show everything. */
  activeFilters?: Set<string>;
  renderIcon: IconRenderer;
  emptyState?: React.ReactNode;
  className?: string;
}

/**
 * Unified cross-department clinical timeline.
 *
 * The point of the component is the department tag: a cardiologist reading this sees
 * what General and Emergency did, in one chronology, rather than three per-department
 * charts. Every entry therefore states its department and its author, and the kind
 * badge carries an icon so the type of event is legible without reading the label.
 *
 * Rendered as an ordered list so a screen reader announces position and count, with
 * the connector line marked decorative.
 */
export const Timeline: React.FC<TimelineProps> = ({ entries, activeFilters, renderIcon, emptyState, className }) => {
  const rows = React.useMemo(
    () =>
      !activeFilters || activeFilters.size === 0
        ? entries
        : entries.filter((e) => activeFilters.has(e.kind) || activeFilters.has(e.department)),
    [entries, activeFilters],
  );

  if (!rows.length) return <>{emptyState ?? null}</>;

  return (
    <ol className={cn('relative', className)}>
      {rows.map((e, i) => {
        const kind = ENTRY_KIND[e.kind];
        const last = i === rows.length - 1;
        return (
          <li key={e.id} className={cn('relative flex gap-3', last ? 'pb-0' : 'pb-4')}>
            {!last ? <span className="absolute left-4 top-9 bottom-0 w-px bg-outline" aria-hidden /> : null}

            <span
              className={cn(
                'relative z-[1] w-8 h-8 shrink-0 rounded-lg grid place-items-center ring-4 ring-[rgb(var(--s0))]',
                TONE_CONTAINER[kind.tone],
              )}
            >
              {renderIcon(kind.icon, 'w-4 h-4')}
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-base font-semibold">{e.title}</span>
                <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold bg-info-container text-info-container-foreground">
                  {renderIcon('building-2', 'w-3 h-3')}
                  {e.departmentName}
                </span>
                {e.flagged ? (
                  <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-semibold bg-danger-container text-danger-container-foreground">
                    {renderIcon('alert-circle', 'w-3 h-3')}
                    Abnormal
                  </span>
                ) : null}
                <span className="num text-2xs text-subtle">{e.at}</span>
              </div>

              <p className="text-base text-muted mt-1 leading-relaxed">{e.body}</p>

              {e.diagnosis ? (
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md bg-surface-2 border border-outline num">
                  {renderIcon('tag', 'w-3 h-3')}
                  {e.diagnosis}
                </p>
              ) : null}

              <p className="text-2xs text-subtle mt-1.5">
                {e.author} · {kind.label}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export interface FilterChipProps {
  label: string;
  count?: number;
  active: boolean;
  onToggle: () => void;
}

/**
 * Filter chip.
 *
 * A real toggle button with `aria-pressed`, not a styled div. Counts are derived
 * from the data by the caller so a badge can never disagree with the list.
 */
export const FilterChip: React.FC<FilterChipProps> = ({ label, count, active, onToggle }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onToggle}
    className={cn(
      'inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-base font-medium press whitespace-nowrap',
      active
        ? 'bg-primary text-primary-foreground border-transparent'
        : 'bg-surface-0 text-foreground border-outline hover:bg-surface-2',
    )}
  >
    <span>{label}</span>
    {count != null ? (
      <span className={cn('num text-2xs px-1.5 py-0.5 rounded-full', active ? 'bg-primary-foreground/20' : 'bg-surface-3')}>
        {count}
      </span>
    ) : null}
  </button>
);
