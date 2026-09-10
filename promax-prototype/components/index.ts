/**
 * Hospital MS — Pro Max component library.
 *
 * The TypeScript expression of the same contract the HTML prototype implements in
 * `prototype/ui.js`. See `../DESIGN_SYSTEM.md` for the tokens these components are
 * written against, and `../README.md` §"What changed" for why each one exists.
 *
 * Two conventions run through every file:
 *
 *  1. **No icon-library import.** Components take a `renderIcon(name, className)`
 *     function, so the library is not coupled to Phosphor, Lucide or anything else,
 *     and a consumer can swap icon sets without touching component code.
 *  2. **No raw colour values.** Everything references the semantic tokens in
 *     `tokens.ts`, which resolve to CSS variables redefined per theme. A component
 *     written against a token is correct in light and dark with no second code path.
 */

export { cn } from './cn';

export {
  TONE_CONTAINER,
  TONE_TEXT,
  SURFACE,
  SPACE,
  MOTION,
  RADIUS,
  Z,
  BREAKPOINT,
  ACTION_FLAG,
  can,
  type Tone,
  type Density,
  type ThemePref,
  type DataState,
  type Role,
  type ModuleName,
  type PermissionAction,
  type PermissionGrant,
  type PermissionMatrixData,
} from './tokens';

export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { StatusChip, STATUS, type StatusKey, type StatusMeta, type IconRenderer } from './StatusChip';
export { AcuityBadge, ACUITY, byAcuity, type Acuity } from './AcuityBadge';
export { MetricCard, type MetricCardProps } from './MetricCard';
export { Field, ErrorSummary, type FieldProps, type FieldType, type SelectOption } from './Field';
export { DataTable, type Column, type BulkAction, type DataTableProps } from './DataTable';
export { Dialog, ConfirmDialog, type DialogProps, type DialogAction, type ConfirmDialogProps } from './Dialog';
export { ToastProvider, useToast, type ToastSpec } from './Toast';
export {
  EmptyState,
  ErrorState,
  SkeletonRows,
  StateRegion,
  StateSwitch,
  type EmptyStateProps,
  type ErrorStateProps,
  type StateRegionProps,
} from './StateRegion';
export { AppShell, type AppShellProps, type NavItem, type NavChild, type Session } from './AppShell';
export { WidgetGrid, type WidgetDefinition, type WidgetGridProps } from './WidgetGrid';
export { Meter, type MeterProps } from './Meter';
export { Sparkline, type SparklineProps } from './Sparkline';
export { PatientHeader, type Patient, type PatientHeaderProps } from './PatientHeader';
export {
  Timeline,
  FilterChip,
  ENTRY_KIND,
  type TimelineEntry,
  type EntryKind,
  type TimelineProps,
} from './Timeline';
export {
  PermissionMatrix,
  pendingChanges,
  type PermissionMatrixProps,
  type PermissionChange,
} from './PermissionMatrix';
export { CommandPalette, type CommandItem, type CommandPaletteProps } from './CommandPalette';
