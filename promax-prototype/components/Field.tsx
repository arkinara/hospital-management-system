import React from 'react';
import { cn } from './cn';
import type { IconRenderer } from './StatusChip';

export type FieldType =
  | 'text' | 'email' | 'tel' | 'number' | 'password' | 'date' | 'time' | 'search'
  | 'select' | 'textarea';

export interface SelectOption {
  label: string;
  value?: string;
}

export interface FieldProps {
  id: string;
  /** Always visible. A placeholder is an example, never a label. */
  label: string;
  type?: FieldType;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  /** Persistent helper text. Survives focus, unlike a placeholder. */
  help?: string;
  /**
   * Validation message. States the cause AND the fix:
   * "National ID must be exactly 16 digits (you entered 14)".
   */
  error?: string;
  required?: boolean;
  /** Renders "(optional)" so the absence of an asterisk is not the only signal. */
  optional?: boolean;
  disabled?: boolean;
  /** Read-only is visually and semantically distinct from disabled. */
  readOnly?: boolean;
  options?: SelectOption[];
  rows?: number;
  /** Leading glyph inside the control. */
  icon?: string;
  renderIcon?: IconRenderer;
  /** Tabular figures, for IDs, currency and vitals. */
  mono?: boolean;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  /** Validation runs on blur, not on every keystroke (Material guidance). */
  onBlurValidate?: (value: string) => void;
  onChange?: (value: string) => void;
  className?: string;
}

/**
 * Form field.
 *
 * Guarantees: a visible label bound with `htmlFor`; a required marker that is also
 * announced as text; persistent helper text; a validation message rendered under
 * the field it belongs to with `role="alert"`; `aria-invalid` and `aria-describedby`
 * kept in sync; a password reveal toggle with `aria-pressed`; and a >= 44px control
 * height so it is usable on touch.
 */
export const Field: React.FC<FieldProps> = ({
  id,
  label,
  type = 'text',
  value,
  defaultValue,
  placeholder,
  help,
  error,
  required,
  optional,
  disabled,
  readOnly,
  options = [],
  rows = 4,
  icon,
  renderIcon,
  mono,
  autoComplete,
  inputMode,
  onBlurValidate,
  onChange,
  className,
}) => {
  const [revealed, setRevealed] = React.useState(false);
  const helpId = `${id}-help`;
  const errId = `${id}-err`;
  const describedBy = [error ? errId : null, help ? helpId : null].filter(Boolean).join(' ') || undefined;

  const base = cn(
    'w-full min-h-11 rounded-lg bg-surface-0 px-3 text-base text-foreground placeholder:text-subtle focus-inset transition',
    error ? 'border border-danger' : 'border border-outline-strong',
    readOnly && 'bg-surface-2 border-outline',
    mono && 'num',
  );

  const shared = {
    id,
    name: id,
    disabled,
    readOnly,
    required,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onBlurValidate?.(e.currentTarget.value),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange?.(e.currentTarget.value),
  } as const;

  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="block text-base font-medium mb-1.5">
        {label}
        {required ? (
          <>
            {' '}
            <span className="text-danger" aria-hidden>
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : optional ? (
          <span className="text-subtle font-normal text-xs"> (optional)</span>
        ) : null}
      </label>

      <div className="relative">
        {type === 'select' ? (
          <>
            <select {...shared} value={value} defaultValue={defaultValue} className={cn(base, 'pr-9 appearance-none cursor-pointer')}>
              {options.map((o) => (
                <option key={o.value ?? o.label} value={o.value ?? o.label}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
              {renderIcon?.('chevron-down', 'w-4 h-4')}
            </span>
          </>
        ) : type === 'textarea' ? (
          <textarea
            {...shared}
            rows={rows}
            value={value}
            defaultValue={defaultValue}
            placeholder={placeholder}
            className={cn(base, 'py-2.5 leading-relaxed resize-y')}
          />
        ) : (
          <>
            <input
              {...shared}
              type={type === 'password' && revealed ? 'text' : type}
              value={value}
              defaultValue={defaultValue}
              placeholder={placeholder}
              autoComplete={autoComplete}
              inputMode={inputMode}
              className={cn(base, icon && 'pl-9', type === 'password' && 'pr-11')}
            />
            {icon ? (
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                {renderIcon?.(icon, 'w-4 h-4')}
              </span>
            ) : null}
            {type === 'password' ? (
              <button
                type="button"
                onClick={() => setRevealed((r) => !r)}
                aria-pressed={revealed}
                aria-label={revealed ? 'Hide password' : 'Show password'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg grid place-items-center text-muted hover:bg-surface-2"
              >
                {renderIcon?.(revealed ? 'eye-off' : 'eye', 'w-4 h-4')}
              </button>
            ) : null}
          </>
        )}
      </div>

      {help ? (
        <p id={helpId} className="mt-1.5 text-xs text-muted">
          {help}
        </p>
      ) : null}

      {error ? (
        <p id={errId} role="alert" className="mt-1.5 text-xs font-medium text-danger flex items-start gap-1">
          {renderIcon?.('alert-circle', 'w-3.5 h-3.5 shrink-0 mt-px')}
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
};

export interface ErrorSummaryProps {
  /** One entry per invalid field, in visual order. */
  errors: { id: string; label: string }[];
  renderIcon?: IconRenderer;
}

/**
 * Error summary for a submitted form.
 *
 * Anchor links move focus to the offending field, which is what WCAG 3.3.1 and
 * 3.3.3 actually ask for — a message at the top on its own leaves the user hunting.
 */
export const ErrorSummary: React.FC<ErrorSummaryProps> = ({ errors, renderIcon }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (errors.length) ref.current?.focus();
  }, [errors.length]);

  if (!errors.length) return null;

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="rounded-xl border border-danger/50 bg-danger-container text-danger-container-foreground p-3.5"
    >
      <p className="flex items-center gap-2 text-base font-semibold">
        {renderIcon?.('alert-octagon', 'w-4 h-4')}
        {errors.length} field{errors.length > 1 ? 's need' : ' needs'} attention before saving
      </p>
      <ul className="mt-2 space-y-1 text-base">
        {errors.map((e) => (
          <li key={e.id}>
            <a
              href={`#${e.id}`}
              className="underline underline-offset-2 hover:no-underline"
              onClick={(ev) => {
                ev.preventDefault();
                document.getElementById(e.id)?.focus();
              }}
            >
              {e.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};
