import React from 'react';
import { cn } from './cn';
import type { DataState } from './tokens';
import type { IconRenderer } from './StatusChip';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: string;
  /** Name the situation, not the widget: "No patient matches these filters". */
  title: string;
  /** Say why it is empty and what to do next. */
  body: string;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  renderIcon: IconRenderer;
}

/** Empty state: cause plus next action, never a bare "No data". */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon = 'inbox', title, body, action, secondary, renderIcon }) => (
  <div className="flex flex-col items-center text-center px-6 py-12">
    <span className="w-12 h-12 rounded-2xl bg-surface-2 border border-outline grid place-items-center text-muted mb-3.5">
      {renderIcon(icon, 'w-6 h-6')}
    </span>
    <h3 className="text-lg font-semibold font-display">{title}</h3>
    <p className="mt-1.5 text-base text-muted max-w-sm leading-relaxed">{body}</p>
    {action || secondary ? (
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {action}
        {secondary}
      </div>
    ) : null}
  </div>
);

export interface ErrorStateProps {
  title?: string;
  /** State the cause and reassure about what is safe. */
  body?: string;
  /** Support can only chase what the user can read back to them. */
  traceId?: string;
  onRetry?: () => void;
  retrying?: boolean;
  renderIcon: IconRenderer;
}

/** Error state: cause, recovery path, and an identifier support can trace. */
export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Could not load this data',
  body = 'The request timed out after 30 seconds. Your work is not lost.',
  traceId,
  onRetry,
  retrying,
  renderIcon,
}) => (
  <div className="flex flex-col items-center text-center px-6 py-12" role="alert">
    <span className="w-12 h-12 rounded-2xl bg-danger-container text-danger-container-foreground grid place-items-center mb-3.5">
      {renderIcon('cloud-off', 'w-6 h-6')}
    </span>
    <h3 className="text-lg font-semibold font-display">{title}</h3>
    <p className="mt-1.5 text-base text-muted max-w-md leading-relaxed">{body}</p>
    {onRetry ? (
      <div className="mt-4">
        <Button variant="primary" icon={renderIcon('rotate-cw', 'w-4 h-4')} loading={retrying} loadingLabel="Retrying…" onClick={onRetry}>
          Retry
        </Button>
      </div>
    ) : null}
    {traceId ? <p className="mt-3 text-xs text-subtle num">Trace {traceId}</p> : null}
  </div>
);

export interface SkeletonRowsProps {
  rows?: number;
  columns?: number;
}

/**
 * Loading placeholder shaped like the content it replaces, so the layout does not
 * jump when data arrives. The shimmer becomes a static block under
 * `prefers-reduced-motion` (handled in CSS, not here).
 */
export const SkeletonRows: React.FC<SkeletonRowsProps> = ({ rows = 6, columns = 5 }) => {
  const widths = [160, 90, 120, 70, 100];
  return (
    <div className="p-3 space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3" style={{ height: 'var(--row-h)' }}>
          <span className="skel w-8 h-8 rounded-full shrink-0" />
          {Array.from({ length: columns }).map((__, c) => (
            <span key={c} className="skel h-3.5 flex-1" style={{ maxWidth: widths[c % widths.length] }} />
          ))}
        </div>
      ))}
    </div>
  );
};

export interface StateRegionProps {
  state: DataState;
  ready: React.ReactNode;
  loading?: React.ReactNode;
  empty: React.ReactNode;
  error: React.ReactNode;
  className?: string;
}

/**
 * One data region, four states.
 *
 * Declaring all four in one place is what makes a page reviewable: a designer can
 * flip between them instead of taking "there is an empty state somewhere" on trust.
 */
export const StateRegion: React.FC<StateRegionProps> = ({ state, ready, loading, empty, error, className }) => (
  <div className={cn('relative', className)}>
    {state === 'ready' ? ready : null}
    {state === 'loading' ? loading ?? <SkeletonRows /> : null}
    {state === 'empty' ? empty : null}
    {state === 'error' ? error : null}
  </div>
);

export interface StateSwitchProps {
  state: DataState;
  onChange: (s: DataState) => void;
}

/**
 * Review control for the four states.
 *
 * A prototype affordance, and a genuinely useful QA tool: it makes "does the empty
 * state read well?" a question you can answer in one click.
 */
export const StateSwitch: React.FC<StateSwitchProps> = ({ state, onChange }) => {
  const states: DataState[] = ['ready', 'loading', 'empty', 'error'];
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-surface-0 border border-outline p-0.5" role="group" aria-label="Preview data state">
      {states.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={s === state}
          onClick={() => onChange(s)}
          className={cn(
            'px-2.5 h-8 rounded-md text-xs font-semibold capitalize press cursor-pointer',
            s === state ? 'bg-primary text-primary-foreground' : 'text-muted hover:bg-surface-3',
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
};
