/**
 * Hospital MS — Pro Max component library.
 *
 * The TypeScript expression of the contract in
 * `promax-prototype/DESIGN_SYSTEM.md`. Every component is written against the
 * semantic tokens in `tokens.ts`, which resolve to the CSS variables seeded in
 * `src/styles/tokens.css`.
 *
 * Two conventions run through every file:
 *
 *  1. **No icon-library import.** Components take a `renderIcon(name, className)`
 *     function, so the library is not coupled to Lucide, Phosphor or anything else,
 *     and a consumer can swap icon sets without touching component code.
 *  2. **No raw colour values.** Everything references the semantic tokens, so a
 *     component written against a token is correct in light and dark with no second
 *     code path.
 */

export { cn } from "./cn";

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
} from "./tokens";

export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from "./Button";
export {
  StatusChip,
  STATUS,
  type StatusKey,
  type StatusMeta,
  type IconRenderer,
} from "./StatusChip";
export { AcuityBadge, ACUITY, byAcuity, type Acuity, type AcuityBadgeProps } from "./AcuityBadge";
export { MetricCard, type MetricCardProps } from "./MetricCard";
export {
  Field,
  ErrorSummary,
  type FieldProps,
  type FieldType,
  type SelectOption,
  type ErrorSummaryProps,
} from "./Field";
export {
  DataTable,
  type Column,
  type BulkAction,
  type DataTableProps,
} from "./DataTable";
export {
  Dialog,
  ConfirmDialog,
  type DialogProps,
  type DialogAction,
  type ConfirmDialogProps,
} from "./Dialog";
export { ToastProvider, useToast, type ToastSpec, type ToastProviderProps } from "./Toast";
export {
  StateRegion,
  StateSwitch,
  type StateRegionProps,
  type StateSwitchProps,
} from "./StateRegion";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { ErrorState, type ErrorStateProps } from "./ErrorState";
export { SkeletonRows, type SkeletonRowsProps } from "./SkeletonRows";
export {
  AppShell,
  type AppShellProps,
  type NavItem,
  type NavChild,
  type Session,
} from "./AppShell";
export { WidgetGrid, type WidgetDefinition, type WidgetGridProps } from "./WidgetGrid";
export { Meter, type MeterProps } from "./Meter";
export { Sparkline, type SparklineProps } from "./Sparkline";
export { PatientHeader, type Patient, type PatientHeaderProps } from "./PatientHeader";
export {
  Timeline,
  FilterChip,
  ENTRY_KIND,
  type TimelineEntry,
  type EntryKind,
  type TimelineProps,
  type FilterChipProps,
} from "./Timeline";
export {
  PermissionMatrix,
  pendingChanges,
  type PermissionMatrixProps,
  type PermissionChange,
} from "./PermissionMatrix";
export { CommandPalette, type CommandItem, type CommandPaletteProps } from "./CommandPalette";
