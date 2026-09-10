"use client";

import React from "react";
import { cn } from "./cn";
import type { DataState } from "./tokens";
import { SkeletonRows } from "./SkeletonRows";

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
export const StateRegion: React.FC<StateRegionProps> = ({
  state,
  ready,
  loading,
  empty,
  error,
  className,
}) => (
  <div className={cn("relative", className)}>
    {state === "ready" ? ready : null}
    {state === "loading" ? loading ?? <SkeletonRows /> : null}
    {state === "empty" ? empty : null}
    {state === "error" ? error : null}
  </div>
);

export interface StateSwitchProps {
  state: DataState;
  onChange: (s: DataState) => void;
  className?: string;
}

/**
 * Review control for the four states.
 *
 * A prototype affordance, and a genuinely useful QA tool: it makes "does the empty
 * state read well?" a question you can answer in one click.
 */
export const StateSwitch: React.FC<StateSwitchProps> = ({ state, onChange, className }) => {
  const states: DataState[] = ["ready", "loading", "empty", "error"];
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-lg border border-outline bg-surface-0 p-0.5",
        className,
      )}
      role="group"
      aria-label="Preview data state"
    >
      {states.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={s === state}
          onClick={() => onChange(s)}
          className={cn(
            "press h-8 cursor-pointer rounded-md px-2.5 text-xs font-semibold capitalize",
            s === state ? "bg-primary text-primary-foreground" : "text-muted hover:bg-surface-3",
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
};
