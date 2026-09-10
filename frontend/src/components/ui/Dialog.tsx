"use client";

import React from "react";
import { cn } from "./cn";
import { TONE_CONTAINER, type Tone } from "./tokens";
import type { IconRenderer } from "./StatusChip";
import { Button, type ButtonVariant } from "./Button";

export interface DialogAction {
  label: string;
  variant?: ButtonVariant;
  icon?: string;
  /** Return `false` to keep the dialog open, e.g. when validation failed. */
  onAction?: () => boolean | void;
}

export interface DialogProps {
  open: boolean;
  title: string;
  /** Non-neutral tones add a leading icon badge; use sparingly. */
  tone?: Tone;
  size?: "sm" | "md" | "lg" | "xl";
  actions?: DialogAction[];
  /** When this returns true, dismissal asks before discarding. */
  isDirty?: () => boolean;
  onRequestDiscard?: () => void;
  onClose: () => void;
  renderIcon: IconRenderer;
  children: React.ReactNode;
}

const SIZES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
} as const;

const TONE_ICON: Partial<Record<Tone, string>> = {
  danger: "alert-triangle",
  warning: "alert-triangle",
  success: "check",
  info: "info",
};

/**
 * Modal dialog.
 *
 * Guarantees: focus moves in on open and returns to the trigger on close; Tab is
 * trapped inside the panel; Escape closes; the scrim is blurred to signal that the
 * background is dismissible; a dirty form confirms before it is discarded (scrim
 * click routes through `isDirty`/`onRequestDiscard`); and on phones the panel is a
 * bottom sheet, which is where a thumb actually is.
 */
export const Dialog: React.FC<DialogProps> = ({
  open,
  title,
  tone = "neutral",
  size = "md",
  actions = [],
  isDirty,
  onRequestDiscard,
  onClose,
  renderIcon,
  children,
}) => {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const openerRef = React.useRef<Element | null>(null);
  const titleId = React.useId();

  const attemptClose = React.useCallback(() => {
    if (isDirty?.()) {
      onRequestDiscard?.();
      return;
    }
    onClose();
  }, [isDirty, onRequestDiscard, onClose]);

  React.useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((n) => n.offsetParent !== null);

    focusables().find((n) => !n.dataset.close)?.focus();
    if (!focusables().length) panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        attemptClose();
        return;
      }
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      (openerRef.current as HTMLElement | null)?.focus?.();
    };
  }, [open, attemptClose]);

  if (!open) return null;

  return (
    <>
      <div
        data-testid="dialog-scrim"
        className="anim-scrim fixed inset-0 z-scrim"
        style={{ background: "rgb(var(--scrim) / var(--scrim-alpha))", backdropFilter: "blur(2px)" }}
        onClick={attemptClose}
      />
      <div className="pointer-events-none fixed inset-0 z-overlay grid place-items-end overflow-y-auto p-0 sm:place-items-center sm:p-4">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={cn(
            "anim-sheet pointer-events-auto w-full border border-outline bg-surface-0 pb-safe shadow-overlay",
            "rounded-t-2xl sm:rounded-2xl",
            SIZES[size],
          )}
        >
          <header className="flex items-start gap-3 border-b border-outline px-5 pb-3 pt-4">
            {tone !== "neutral" && TONE_ICON[tone] ? (
              <span
                className={cn(
                  "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                  TONE_CONTAINER[tone],
                )}
              >
                {renderIcon(TONE_ICON[tone]!, "h-4 w-4")}
              </span>
            ) : null}
            <h2 id={titleId} className="flex-1 font-display text-lg font-semibold">
              {title}
            </h2>
            <button
              type="button"
              data-close="1"
              onClick={attemptClose}
              aria-label="Close dialog"
              className="press -mr-1.5 -mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2"
            >
              {renderIcon("x", "h-4.5 w-4.5")}
            </button>
          </header>

          <div className="max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>

          {actions.length ? (
            <footer className="flex flex-col-reverse gap-2 rounded-b-2xl border-t border-outline bg-surface-1 px-5 py-3.5 sm:flex-row sm:justify-end">
              {actions.map((a) => (
                <Button
                  key={a.label}
                  variant={a.variant ?? "ghost"}
                  icon={a.icon ? renderIcon(a.icon, "h-4 w-4") : undefined}
                  onClick={() => {
                    if (a.onAction?.() !== false) onClose();
                  }}
                >
                  {a.label}
                </Button>
              ))}
            </footer>
          ) : null}
        </div>
      </div>
    </>
  );
};

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** Bulleted consequences. Clearer than one long sentence. */
  consequences?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onClose: () => void;
  renderIcon: IconRenderer;
}

/**
 * Destructive confirmation.
 *
 * The confirm button carries the danger colour and sits apart from Cancel. Where
 * the action is reversible, prefer doing it immediately and offering Undo in a
 * toast — a confirm dialog is for things that genuinely cannot be walked back.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  consequences = [],
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onClose,
  renderIcon,
}) => (
  <Dialog
    open={open}
    title={title}
    tone={tone}
    size="sm"
    onClose={onClose}
    renderIcon={renderIcon}
    actions={[
      { label: cancelLabel, variant: "ghost" },
      {
        label: confirmLabel,
        variant: tone === "danger" ? "danger" : "primary",
        icon: tone === "danger" ? "trash-2" : "check",
        onAction: onConfirm,
      },
    ]}
  >
    <p className="text-base leading-relaxed text-muted">{message}</p>
    {consequences.length ? (
      <ul className="mt-3 space-y-1.5 text-base">
        {consequences.map((c) => (
          <li key={c} className="flex gap-2">
            <span className="mt-0.5 shrink-0 text-danger">{renderIcon("dot", "h-4 w-4")}</span>
            <span>{c}</span>
          </li>
        ))}
      </ul>
    ) : null}
  </Dialog>
);
