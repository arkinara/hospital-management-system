# Component stories (manual QA)

Storybook is not installed yet (tracked separately under visual-regression #55).
Until it is, this is the manual QA script for the catalogue at `/styleguide`.
Each component is exercised in **both themes** (header sun/moon control) and **both
densities** (header density control) at 375 / 768 / 1024 / 1440 px.

| Component | Manual QA story |
|---|---|
| `Button` | All six variants; hover, focus-visible ring, `:active` scale (no layout shift), loading spinner + `aria-busy`, disabled opacity + `cursor-not-allowed`. Icon-only button exposes its `label` as the accessible name. |
| `Field` | Visible label; required asterisk announced; optional marker; helper persists on focus; error replaces helper, sets `aria-invalid` + `role="alert"`; password reveal toggles `aria-pressed`; select and textarea render. |
| `ErrorSummary` | Submitting a form with two invalid fields focuses the summary; each link moves focus to its field. |
| `DataTable` | Sticky header; click and Enter/Space sort, active column exposes `aria-sort`; row selection shows the bulk bar; card fallback below 768px; loading/empty/error states. |
| `Dialog` | Focus moves in on open and returns to the trigger; Tab wraps; Escape closes; dirty form asks before scrim-click dismissal. |
| `ConfirmDialog` | Danger tone; consequences render as bullets; confirm is spatially separated from cancel. |
| `Toast` | Polite live region; never steals focus; 4s dismiss (7s with Undo); timer pauses on hover/focus. |
| `StateRegion` | Ready / loading / empty / error all render from one region; empty names the cause and the next action. |
| `SkeletonRows` | Shaped like a table; shimmer becomes a static block under `prefers-reduced-motion`. |
| `StatusChip` | Every status renders icon + word + colour; legible in greyscale. |
| `AcuityBadge` | Four ordered steps, each with a distinct glyph. |
| `MetricCard` | Number + unit + signed delta + baseline; inverse tone flips good/bad; tabular figures do not reflow. |
| `Meter` | `role="meter"` value trio; tone escalates to warning at 90% and danger at 100%. |
| `Sparkline` | Decorative (`aria-hidden`); retints on theme switch with no re-render. |
| `WidgetGrid` | Drag reorder and arrow-key reorder both work; locked widget cannot be removed; removal is undoable via toast. |
| `PermissionMatrix` | Real checkboxes with readable aria-labels; granting create/edit/delete grants view; revoking view clears the rest; changed cells tinted. |
| `Timeline` | Ordered list; department tag on every entry; abnormal flag; connector is decorative. |
| `CommandPalette` | Combobox semantics; arrow keys move, Enter runs, Escape closes, focus returns to opener. |
| `AppShell` | Skip link first; nav derived from the permission matrix; one h1; `aria-current="page"`; bottom bar capped at five. |
| `PatientHeader` | Allergy band is a full-width `role="alert"` above everything; national ID masked; balance band opens billing. |
