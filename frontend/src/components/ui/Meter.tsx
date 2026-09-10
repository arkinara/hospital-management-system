"use client";

import React from "react";
import { cn } from "./cn";
import type { Tone } from "./tokens";

export interface MeterProps {
  label: string;
  value: number;
  max: number;
  /** Base tone. Overridden to warning at >= 90% and danger at >= 100%. */
  tone?: Tone;
  /** Secondary line, e.g. "9 beds free · 48 total". */
  sub?: string;
  className?: string;
}

const BAR: Record<Tone, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-outline-strong",
};

/**
 * Capacity meter.
 *
 * The value and the percentage are on the label, not only in the bar length —
 * bar length alone is not readable to a screen reader and is imprecise to the eye.
 * `role="meter"` with the aria value trio makes the real number available.
 *
 * Thresholds escalate the tone on their own so a full ward cannot look calm.
 */
export const Meter: React.FC<MeterProps> = ({ label, value, max, tone = "primary", sub, className }) => {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  const effective: Tone = pct >= 100 ? "danger" : pct >= 90 ? "warning" : tone;

  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="truncate text-base font-medium">{label}</span>
        <span className="num shrink-0 text-xs text-muted">
          {value}/{max} · {pct}%
        </span>
      </div>
      <div
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`${label} occupancy`}
        className="h-2 overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className={cn("h-full rounded-full", BAR[effective])}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {sub ? <p className="mt-1 text-2xs text-subtle">{sub}</p> : null}
    </div>
  );
};
