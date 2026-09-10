"use client";

import React from "react";
import type { IconRenderer } from "./StatusChip";
import { Button } from "./Button";

export interface ErrorStateProps {
  title?: string;
  /** State the cause and reassure about what is safe. */
  body?: string;
  /** Support can only chase what the user can read back to them. */
  traceId?: string;
  onRetry?: () => void;
  retrying?: boolean;
  renderIcon: IconRenderer;
  className?: string;
}

/** Error state: cause, recovery path, and an identifier support can trace. */
export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Could not load this data",
  body = "The request timed out after 30 seconds. Your work is not lost.",
  traceId,
  onRetry,
  retrying,
  renderIcon,
  className,
}) => (
  <div
    className={`flex flex-col items-center px-6 py-12 text-center ${className ?? ""}`}
    role="alert"
  >
    <span className="mb-3.5 grid h-12 w-12 place-items-center rounded-2xl bg-danger-container text-danger-container-foreground">
      {renderIcon("cloud-off", "h-6 w-6")}
    </span>
    <h3 className="font-display text-lg font-semibold">{title}</h3>
    <p className="mt-1.5 max-w-md text-base leading-relaxed text-muted">{body}</p>
    {onRetry ? (
      <div className="mt-4">
        <Button
          variant="primary"
          icon={renderIcon("rotate-cw", "h-4 w-4")}
          loading={retrying}
          loadingLabel="Retrying…"
          onClick={onRetry}
        >
          Retry
        </Button>
      </div>
    ) : null}
    {traceId ? <p className="num mt-3 text-xs text-subtle">Trace {traceId}</p> : null}
  </div>
);
