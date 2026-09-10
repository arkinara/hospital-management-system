"use client";

import React from "react";
import { cn } from "./cn";
import { TONE_CONTAINER, type Tone } from "./tokens";

/** Every workflow status in the system, with the glyph that disambiguates it. */
export type StatusKey =
  | "booked"
  | "checked_in"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show"
  | "admitted"
  | "outpatient"
  | "discharged"
  | "draft"
  | "submitted"
  | "signed"
  | "paid"
  | "partially_paid"
  | "unpaid"
  | "overdue"
  | "none"
  | "approved"
  | "denied"
  | "active"
  | "invited"
  | "inactive"
  | "open"
  | "blocked"
  | "held";

export interface StatusMeta {
  label: string;
  tone: Tone;
  /** Name of a glyph in the app icon set. */
  icon: string;
}

/**
 * Single source of truth for status vocabulary.
 *
 * Colour alone never carries meaning (WCAG 1.4.1), so the chip renders the icon and
 * the word as well. Adding a status means adding it here, not styling one inline.
 */
export const STATUS: Record<StatusKey, StatusMeta> = {
  booked: { label: "Booked", tone: "info", icon: "calendar" },
  checked_in: { label: "Checked in", tone: "info", icon: "log-in" },
  in_progress: { label: "In progress", tone: "info", icon: "loader" },
  completed: { label: "Completed", tone: "success", icon: "check" },
  cancelled: { label: "Cancelled", tone: "danger", icon: "x" },
  no_show: { label: "No-show", tone: "warning", icon: "user-x" },
  admitted: { label: "Admitted", tone: "info", icon: "bed-double" },
  outpatient: { label: "Outpatient", tone: "neutral", icon: "footprints" },
  discharged: { label: "Discharged", tone: "neutral", icon: "door-open" },
  draft: { label: "Draft", tone: "warning", icon: "pencil-line" },
  submitted: { label: "Submitted", tone: "info", icon: "send" },
  signed: { label: "Signed", tone: "success", icon: "check-check" },
  paid: { label: "Paid", tone: "success", icon: "check" },
  partially_paid: { label: "Part paid", tone: "info", icon: "circle-dashed" },
  unpaid: { label: "Unpaid", tone: "danger", icon: "alert-circle" },
  overdue: { label: "Overdue", tone: "danger", icon: "clock-alert" },
  none: { label: "No claim", tone: "neutral", icon: "minus" },
  approved: { label: "Approved", tone: "success", icon: "shield-check" },
  denied: { label: "Denied", tone: "danger", icon: "shield-x" },
  active: { label: "Active", tone: "success", icon: "check" },
  invited: { label: "Invited", tone: "info", icon: "mail" },
  inactive: { label: "Inactive", tone: "neutral", icon: "pause" },
  open: { label: "Open", tone: "success", icon: "plus" },
  blocked: { label: "Blocked", tone: "neutral", icon: "ban" },
  held: { label: "Held", tone: "warning", icon: "hourglass" },
};

/**
 * Icon renderer, injected so this file stays free of any icon-library import.
 * `name` is a glyph key (see `STATUS` / `ACUITY`); `className` sizes it.
 */
export type IconRenderer = (name: string, className?: string) => React.ReactNode;

export interface StatusChipProps {
  status: StatusKey;
  /** Override the wording without changing the tone or icon. */
  label?: string;
  size?: "sm" | "md";
  renderIcon: IconRenderer;
  className?: string;
}

/** Status pill: icon plus colour plus text — never colour alone. */
export const StatusChip: React.FC<StatusChipProps> = ({
  status,
  label,
  size = "md",
  renderIcon,
  className,
}) => {
  const meta = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold",
        size === "sm" ? "px-1.5 py-0.5 text-2xs" : "px-2 py-0.5 text-xs",
        TONE_CONTAINER[meta.tone],
        className,
      )}
    >
      {renderIcon(meta.icon, "h-3 w-3")}
      <span>{label ?? meta.label}</span>
    </span>
  );
};
