import React from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'accent' | 'danger' | 'outline' | 'subtle' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. Exactly one `primary` per screen. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon element, typically a 16px stroke glyph from the app icon set. */
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  /** Shows a spinner, disables the control and sets `aria-busy`. */
  loading?: boolean;
  loadingLabel?: string;
  /** Icon-only buttons MUST pass this; it becomes the accessible name. */
  label?: string;
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-2.5 text-base gap-1.5',
  md: 'min-h-11 px-3.5 text-base gap-2',
  lg: 'min-h-12 px-4 text-md gap-2',
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground border-transparent font-semibold hover:brightness-110',
  accent: 'bg-accent text-accent-foreground border-transparent font-semibold hover:brightness-110',
  danger: 'bg-danger text-surface-0 border-transparent font-semibold hover:brightness-110',
  outline: 'bg-surface-0 text-foreground border-outline-strong font-medium hover:bg-surface-2',
  subtle: 'bg-surface-2 text-foreground border-outline font-medium hover:bg-surface-3',
  ghost: 'bg-transparent text-foreground border-transparent font-medium hover:bg-surface-2',
};

/**
 * The one button.
 *
 * Guarantees: >= 44px hit height at `md` and `lg`; a focus ring inherited from the
 * global `:focus-visible` rule and never removed; press feedback that scales rather
 * than moving layout; and a disabled state that is both visually reduced and
 * genuinely non-interactive.
 *
 * The `sm` size is for toolbars and table rows where surrounding padding already
 * provides the 44px target — do not use it as a standalone primary action on touch.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'ghost',
    size = 'md',
    icon,
    iconRight,
    loading = false,
    loadingLabel = 'Working…',
    label,
    children,
    className,
    disabled,
    type,
    ...rest
  },
  ref,
) {
  const content = children ?? label;
  const iconOnly = !content;

  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={iconOnly ? label : rest['aria-label']}
      className={cn(
        'inline-flex items-center justify-center rounded-lg border press cursor-pointer',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        iconOnly && 'aspect-square px-0',
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <>
          <span
            className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"
            aria-hidden
          />
          <span>{loadingLabel}</span>
        </>
      ) : (
        <>
          {icon}
          {content ? <span>{content}</span> : null}
          {iconRight}
        </>
      )}
    </button>
  );
});
