"use client";

import React from "react";
import type { IconRenderer } from "./StatusChip";

export interface EmptyStateProps {
  icon?: string;
  /** Name the situation, not the widget: "No patient matches these filters". */
  title: string;
  /** Say why it is empty and what to do next. */
  body: string;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  renderIcon: IconRenderer;
  className?: string;
}

/** Empty state: cause plus next action, never a bare "No data". */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = "inbox",
  title,
  body,
  action,
  secondary,
  renderIcon,
  className,
}) => (
  <div className={`flex flex-col items-center px-6 py-12 text-center ${className ?? ""}`}>
    <span className="mb-3.5 grid h-12 w-12 place-items-center rounded-2xl border border-outline bg-surface-2 text-muted">
      {renderIcon(icon, "h-6 w-6")}
    </span>
    <h3 className="font-display text-lg font-semibold">{title}</h3>
    <p className="mt-1.5 max-w-sm text-base leading-relaxed text-muted">{body}</p>
    {action || secondary ? (
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {action}
        {secondary}
      </div>
    ) : null}
  </div>
);
