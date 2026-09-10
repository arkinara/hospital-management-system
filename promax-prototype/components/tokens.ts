/**
 * Design tokens, mirrored from `prototype/theme.js`.
 *
 * Components reference these names, never raw colour values. The CSS variables
 * behind them are redefined per theme, so a component written against a token is
 * correct in light and dark without a second code path.
 */

/** Semantic tones. `neutral` is the absence of signal, not a fifth status. */
export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** Tone to container/foreground pair. Always paired with an icon at the call site. */
export const TONE_CONTAINER: Record<Tone, string> = {
  primary: 'bg-primary-container text-primary-container-foreground',
  success: 'bg-success-container text-success-container-foreground',
  warning: 'bg-warning-container text-warning-container-foreground',
  danger: 'bg-danger-container text-danger-container-foreground',
  info: 'bg-info-container text-info-container-foreground',
  neutral: 'bg-surface-3 text-muted',
};

/** Foreground-only tone, for icons and inline emphasis. */
export const TONE_TEXT: Record<Tone, string> = {
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  neutral: 'text-muted',
};

/** Surface ramp: 0 card, 1 chrome, 2 well and table head, 3 hover, 4 pressed. */
export const SURFACE = ['bg-surface-0', 'bg-surface-1', 'bg-surface-2', 'bg-surface-3', 'bg-surface-4'] as const;

/** 4px rhythm. Use these names rather than arbitrary pixel values. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Motion tier 4/10: short, purposeful, interruptible. Milliseconds. */
export const MOTION = {
  fast: 120,
  base: 180,
  enter: 200,
  sheet: 220,
  stagger: 35,
  staggerCap: 350,
  ease: 'cubic-bezier(.2,.7,.3,1)',
} as const;

/** Radii in px. Sharper than a consumer app: a data tool should read as precise. */
export const RADIUS = { sm: 4, base: 6, md: 8, lg: 10, xl: 12, xxl: 14, pill: 9999 } as const;

/** Layered z-index scale. Never inline a z-index outside this table. */
export const Z = { nav: 20, sticky: 30, fab: 40, scrim: 50, overlay: 60, toast: 70 } as const;

/** Breakpoints. Compact density is gated at `lg` so touch targets stay >= 44px. */
export const BREAKPOINT = { sm: 375, md: 768, lg: 1024, xl: 1440 } as const;

/**
 * Row density.
 *
 * `compact` is a pointer-width affordance only; below `lg` the CSS falls back to
 * `comfortable` so every interactive row keeps a >= 44px hit area.
 */
export type Density = 'compact' | 'comfortable';

export type ThemePref = 'light' | 'dark' | 'system';

/** The four states every data region must be able to render. */
export type DataState = 'ready' | 'loading' | 'empty' | 'error';

export type Role = 'Admin' | 'Doctor' | 'Nurse' | 'Receptionist';
export type ModuleName = 'Patients' | 'Appointments' | 'Records' | 'Billing' | 'Admin' | 'Reports';
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

/**
 * Compact permission encoding: a subset of the letters `vced`.
 *
 * `create`, `edit` and `delete` are meaningless without `view`, so the matrix
 * component enforces that dependency rather than trusting the caller.
 */
export type PermissionGrant = string;
export type PermissionMatrixData = Record<Role, Record<ModuleName, PermissionGrant>>;

export const ACTION_FLAG: Record<PermissionAction, string> = {
  view: 'v',
  create: 'c',
  edit: 'e',
  delete: 'd',
};

export const can = (grant: PermissionGrant, action: PermissionAction): boolean =>
  grant.includes(ACTION_FLAG[action]);
