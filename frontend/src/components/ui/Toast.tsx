"use client";

import React from "react";
import { cn } from "./cn";
import { TONE_TEXT, Z, type Tone } from "./tokens";
import type { IconRenderer } from "./StatusChip";

export interface ToastSpec {
  id: string;
  message: string;
  detail?: string;
  tone?: Tone;
  /** Present an Undo affordance. Prefer this over a confirm dialog where possible. */
  onUndo?: () => void;
}

const TONE_ICON: Record<Tone, string> = {
  success: "check-circle-2",
  danger: "alert-octagon",
  warning: "alert-triangle",
  info: "info",
  primary: "info",
  neutral: "bell",
};

const TONE_BORDER: Record<Tone, string> = {
  success: "border-success/40",
  danger: "border-danger/40",
  warning: "border-warning/40",
  info: "border-info/40",
  primary: "border-primary/40",
  neutral: "border-outline",
};

/** Toasts with Undo live longer, because the user has to decide something. */
const LIFETIME = { plain: 4000, withUndo: 7000 } as const;

interface ToastContextValue {
  toast: (spec: Omit<ToastSpec, "id">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
};

export interface ToastProviderProps {
  renderIcon: IconRenderer;
  children: React.ReactNode;
}

/**
 * Toast host.
 *
 * Guarantees: announced through a polite live region so it never interrupts; never
 * steals focus; the timer pauses while the toast is hovered or focused, so an Undo
 * cannot expire while the user is reaching for it; and it sits above the safe-area
 * inset so it is not under a phone's gesture bar.
 */
export const ToastProvider: React.FC<ToastProviderProps> = ({ renderIcon, children }) => {
  const [items, setItems] = React.useState<ToastSpec[]>([]);
  const [live, setLive] = React.useState("");
  const timers = React.useRef(new Map<string, number>());

  const dismiss = React.useCallback((id: string) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const arm = React.useCallback(
    (id: string, ms: number) => {
      window.clearTimeout(timers.current.get(id));
      timers.current.set(id, window.setTimeout(() => dismiss(id), ms));
    },
    [dismiss],
  );

  const toast = React.useCallback(
    (spec: Omit<ToastSpec, "id">) => {
      const id = `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      setItems((list) => [...list, { ...spec, id }]);
      setLive(spec.message);
      arm(id, spec.onUndo ? LIFETIME.withUndo : LIFETIME.plain);
    },
    [arm],
  );

  React.useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {live}
      </div>

      <div
        className="pb-safe pointer-events-none fixed bottom-4 left-4 right-4 flex flex-col-reverse gap-2 sm:left-auto"
        style={{ zIndex: Z.toast }}
        role="region"
        aria-label="Notifications"
      >
        {items.map((t) => {
          const tone = t.tone ?? "neutral";
          return (
            <div
              key={t.id}
              className={cn(
                "anim-in pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface-0 px-3.5 py-3 shadow-overlay sm:w-96",
                TONE_BORDER[tone],
              )}
              onMouseEnter={() => window.clearTimeout(timers.current.get(t.id))}
              onFocus={() => window.clearTimeout(timers.current.get(t.id))}
              onMouseLeave={() => arm(t.id, 3000)}
            >
              <span className={cn("mt-0.5 shrink-0", TONE_TEXT[tone])}>
                {renderIcon(TONE_ICON[tone], "h-4.5 w-4.5")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium leading-snug">{t.message}</p>
                {t.detail ? <p className="mt-0.5 text-xs text-muted">{t.detail}</p> : null}
              </div>
              {t.onUndo ? (
                <button
                  type="button"
                  onClick={() => {
                    dismiss(t.id);
                    t.onUndo?.();
                  }}
                  className="press -my-1 min-h-11 shrink-0 rounded-lg px-2.5 text-base font-semibold text-primary hover:bg-surface-2"
                >
                  Undo
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="press -mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2"
              >
                {renderIcon("x", "h-4 w-4")}
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
