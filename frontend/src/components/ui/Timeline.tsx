"use client";

import React from "react";
import { cn } from "./cn";
import { TONE_CONTAINER, type Tone } from "./tokens";
import type { IconRenderer } from "./StatusChip";

export type EntryKind =
  | "note"
  | "vitals"
  | "prescription"
  | "lab"
  | "admission"
  | "procedure"
  | "attachment"
  | "care_plan"
  | "billing";

export const ENTRY_KIND: Record<EntryKind, { label: string; icon: string; tone: Tone }> = {
  note: { label: "Visit note", icon: "file-text", tone: "info" },
  vitals: { label: "Vitals", icon: "activity", tone: "success" },
  prescription: { label: "Prescription", icon: "pill", tone: "warning" },
  lab: { label: "Lab result", icon: "flask-conical", tone: "warning" },
  admission: { label: "Admission", icon: "bed-double", tone: "warning" },
  procedure: { label: "Procedure", icon: "scissors", tone: "danger" },
  attachment: { label: "Attachment", icon: "paperclip", tone: "neutral" },
  care_plan: { label: "Care plan", icon: "list-checks", tone: "info" },
  billing: { label: "Billing", icon: "receipt-text", tone: "primary" },
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
  /** Per-entry action (e.g. a "View source" link), rendered under the author line. */
  entryAction?: (entry: TimelineEntry) => React.ReactNode;
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
export const Timeline: React.FC<TimelineProps> = ({
  entries,
  activeFilters,
  renderIcon,
  emptyState,
  entryAction,
  className,
}) => {
  const rows = React.useMemo(
    () =>
      !activeFilters || activeFilters.size === 0
        ? entries
        : entries.filter((e) => activeFilters.has(e.kind) || activeFilters.has(e.department)),
    [entries, activeFilters],
  );

  if (!rows.length) return <>{emptyState ?? null}</>;

  return (
    <ol className={cn("relative", className)}>
      {rows.map((e, i) => {
        const kind = ENTRY_KIND[e.kind];
        const last = i === rows.length - 1;
        return (
          <li key={e.id} className={cn("relative flex gap-3", last ? "pb-0" : "pb-4")}>
            {!last ? (
              <span className="absolute bottom-0 left-4 top-9 w-px bg-outline" aria-hidden />
            ) : null}

            <span
              className={cn(
                "relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-4 ring-[rgb(var(--s0))]",
                TONE_CONTAINER[kind.tone],
              )}
            >
              {renderIcon(kind.icon, "h-4 w-4")}
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-base font-semibold">{e.title}</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-info-container px-1.5 py-0.5 text-2xs font-semibold text-info-container-foreground">
                  {renderIcon("building-2", "h-3 w-3")}
                  {e.departmentName}
                </span>
                {e.flagged ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-danger-container px-1.5 py-0.5 text-2xs font-semibold text-danger-container-foreground">
                    {renderIcon("alert-circle", "h-3 w-3")}
                    Abnormal
                  </span>
                ) : null}
                <span className="num text-2xs text-subtle">{e.at}</span>
              </div>

              <p className="mt-1 text-base leading-relaxed text-muted">{e.body}</p>

              {e.diagnosis ? (
                <p className="num mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-outline bg-surface-2 px-2 py-1 text-xs font-medium">
                  {renderIcon("tag", "h-3 w-3")}
                  {e.diagnosis}
                </p>
              ) : null}

              <p className="mt-1.5 text-2xs text-subtle">
                {e.author} · {kind.label}
              </p>

              {entryAction ? <div className="mt-2">{entryAction(e)}</div> : null}
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
      "press inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-base font-medium",
      active
        ? "border-transparent bg-primary text-primary-foreground"
        : "border-outline bg-surface-0 text-foreground hover:bg-surface-2",
    )}
  >
    <span>{label}</span>
    {count != null ? (
      <span
        className={cn(
          "num rounded-full px-1.5 py-0.5 text-2xs",
          active ? "bg-primary-foreground/20" : "bg-surface-3",
        )}
      >
        {count}
      </span>
    ) : null}
  </button>
);
