import React from 'react';
import { cn } from './cn';
import type { IconRenderer } from './StatusChip';

export interface MetricCardProps {
  label: string;
  /** Pre-formatted. Locale formatting belongs to the caller, not the card. */
  value: string | number;
  unit?: string;
  /** Signed percentage change. Omit when there is no baseline to compare against. */
  delta?: number;
  /** What the delta is measured against, e.g. "vs last Tuesday". */
  deltaLabel?: string;
  /**
   * `inverse` means a rise is bad — unsigned records, occupancy, no-shows. Without
   * it, up reads as good, which is wrong for half the metrics in a hospital.
   */
  tone?: 'normal' | 'inverse';
  icon?: string;
  renderIcon?: IconRenderer;
  /** Optional sparkline element; decorative, so it must be aria-hidden. */
  spark?: React.ReactNode;
  className?: string;
}

/**
 * Dense KPI tile.
 *
 * A number with no baseline is not information, so the tile always has room for a
 * signed delta with a direction icon and the comparison it was made against. The
 * value uses tabular figures (`.num`) so it does not reflow as it ticks.
 */
export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  tone = 'normal',
  icon,
  renderIcon,
  spark,
  className,
}) => {
  const up = delta != null && delta >= 0;
  const good = tone === 'inverse' ? !up : up;

  return (
    <div className={cn('card !p-3.5 flex flex-col gap-2 min-w-0', className)}>
      <div className="flex items-center gap-2 min-w-0">
        {icon && renderIcon ? (
          <span className="w-7 h-7 shrink-0 rounded-md bg-surface-2 border border-outline grid place-items-center text-muted">
            {renderIcon(icon, 'w-4 h-4')}
          </span>
        ) : null}
        <span className="text-xs font-medium text-muted truncate">{label}</span>
      </div>

      <div className="flex items-end gap-1.5 flex-wrap">
        <span className="num text-3xl font-bold leading-none tracking-tight">{value}</span>
        {unit ? <span className="text-xs text-muted mb-0.5">{unit}</span> : null}
      </div>

      <div className="flex items-center justify-between gap-2 min-w-0">
        {delta != null ? (
          <>
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-xs font-semibold',
                good ? 'text-success' : 'text-danger',
              )}
            >
              {renderIcon?.(up ? 'trending-up' : 'trending-down', 'w-3.5 h-3.5')}
              <span className="num">
                {up ? '+' : ''}
                {delta}%
              </span>
            </span>
            <span className="text-2xs text-subtle truncate">{deltaLabel ?? 'vs last week'}</span>
          </>
        ) : (
          <span className="text-2xs text-subtle truncate">{deltaLabel ?? ''}</span>
        )}
      </div>

      {spark ? (
        <div className="-mx-1 -mb-1" aria-hidden>
          {spark}
        </div>
      ) : null}
    </div>
  );
};
