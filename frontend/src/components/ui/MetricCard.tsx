"use client";

import React from "react";
import { cn } from "./cn";
import type { IconRenderer } from "./StatusChip";

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
  tone?: "normal" | "inverse";
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
  tone = "normal",
  icon,
  renderIcon,
  spark,
  className,
}) => {
  const up = delta != null && delta >= 0;
  const good = tone === "inverse" ? !up : up;

  return (
    <div className={cn("card flex min-w-0 flex-col gap-2 !p-3.5", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {icon && renderIcon ? (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-outline bg-surface-2 text-muted">
            {renderIcon(icon, "h-4 w-4")}
          </span>
        ) : null}
        <span className="truncate text-xs font-medium text-muted">{label}</span>
      </div>

      <div className="flex flex-wrap items-end gap-1.5">
        <span className="num text-3xl font-bold leading-none tracking-tight">{value}</span>
        {unit ? <span className="mb-0.5 text-xs text-muted">{unit}</span> : null}
      </div>

      <div className="flex min-w-0 items-center justify-between gap-2">
        {delta != null ? (
          <>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-semibold",
                good ? "text-success" : "text-danger",
              )}
            >
              {renderIcon?.(up ? "trending-up" : "trending-down", "h-3.5 w-3.5")}
              <span className="num">
                {up ? "+" : ""}
                {delta}%
              </span>
            </span>
            <span className="truncate text-2xs text-subtle">{deltaLabel ?? "vs last week"}</span>
          </>
        ) : (
          <span className="truncate text-2xs text-subtle">{deltaLabel ?? ""}</span>
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
