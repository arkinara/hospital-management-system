"use client";

import React from "react";
import { cn } from "./cn";
import type { IconRenderer } from "./StatusChip";

export interface Column<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  width?: string;
  /** Sortable unless explicitly turned off. */
  sortable?: boolean;
  /** Tabular figures for this column. */
  mono?: boolean;
  cell?: (row: T) => React.ReactNode;
  /** Sort key when the rendered cell is not what should be compared. */
  sortValue?: (row: T) => string | number;
}

export interface BulkAction<T> {
  label: string;
  icon?: string;
  variant?: "primary" | "danger" | "subtle";
  onAction: (rows: T[]) => void;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Accessible name for the table. */
  label: string;
  /** Longer description, rendered as a visually hidden `<caption>`. */
  caption?: string;
  /** Human label for a single row, used by the selection checkbox's aria-label. */
  rowLabel?: (row: T) => string;
  selectable?: boolean;
  bulkActions?: BulkAction<T>[];
  initialSort?: { key: string; dir: "asc" | "desc" };
  onRowActivate?: (row: T) => void;
  /** Card layout for < 768px, so nothing scrolls sideways on a phone. */
  mobileCard?: (row: T) => React.ReactNode;
  footer?: React.ReactNode;
  maxHeight?: string;
  renderIcon: IconRenderer;
  className?: string;
}

/**
 * Dense data table.
 *
 * Guarantees:
 *  - sticky header carrying real `aria-sort`, sortable by click AND by Enter/Space
 *  - selection with a bulk bar; destructive bulk actions are expected to offer Undo
 *    from the toast rather than a confirm-only flow
 *  - a card list under 768px instead of a horizontally scrolling table
 *  - `<caption>` for screen readers, `scope` on every header cell
 *  - row activation available from the keyboard, because a clickable `<tr>` alone
 *    is not reachable
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  label,
  caption,
  rowLabel,
  selectable = false,
  bulkActions = [],
  initialSort,
  onRowActivate,
  mobileCard,
  footer,
  maxHeight,
  renderIcon,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = React.useState(initialSort ?? null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const sorted = React.useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const get =
      col?.sortValue ?? ((r: T) => (r as Record<string, unknown>)[sort.key] as string | number);
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      const n =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "en", { numeric: true });
      return sort.dir === "desc" ? -n : n;
    });
  }, [rows, columns, sort]);

  const toggleSort = (key: string) =>
    setSort((s) =>
      s && s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  const allSelected = sorted.length > 0 && sorted.every((r) => selected.has(rowKey(r)));
  const selectedRows = sorted.filter((r) => selected.has(rowKey(r)));

  const ariaSort = (key: string): React.AriaAttributes["aria-sort"] =>
    sort?.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none";

  return (
    <div className={cn("min-w-0", className)}>
      {selectable && selected.size > 0 ? (
        <div className="anim-in sticky top-0 z-sticky flex flex-wrap items-center gap-2 border-b border-outline bg-primary-container px-3 py-2 text-primary-container-foreground">
          <span className="num text-base font-semibold">{selected.size} selected</span>
          <span className="flex-1" />
          {bulkActions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                a.onAction(selectedRows);
                setSelected(new Set());
              }}
              className={cn(
                "press inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-base font-medium",
                a.variant === "primary" && "bg-primary text-primary-foreground",
                a.variant === "danger" && "bg-danger text-surface-0",
                (!a.variant || a.variant === "subtle") &&
                  "border border-outline bg-surface-2 text-foreground",
              )}
            >
              {a.icon ? renderIcon(a.icon, "h-3.5 w-3.5") : null}
              <span>{a.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="press h-9 rounded-lg px-2.5 text-base font-medium hover:bg-surface-3"
          >
            Clear
          </button>
        </div>
      ) : null}

      {/* Pointer widths: the dense table */}
      <div
        className="hidden overflow-x-auto overscroll-x-contain md:block"
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table className="dt">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr>
              {selectable ? (
                <th scope="col" className="w-10">
                  <span className="sr-only">Select</span>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) =>
                      setSelected(e.currentTarget.checked ? new Set(sorted.map(rowKey)) : new Set())
                    }
                    aria-label={`Select all ${sorted.length} rows`}
                    className="h-4 w-4 cursor-pointer align-middle accent-[rgb(var(--primary))]"
                  />
                </th>
              ) : null}
              {columns.map((c) => {
                const sortable = c.sortable !== false;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={sortable ? ariaSort(c.key) : undefined}
                    style={c.width ? { width: c.width } : undefined}
                    className={cn("group", c.align === "right" && "text-right")}
                  >
                    <button
                      type="button"
                      disabled={!sortable}
                      onClick={sortable ? () => toggleSort(c.key) : undefined}
                      className={cn(
                        "press inline-flex min-h-9 w-full items-center gap-1 text-left font-semibold",
                        c.align === "right" && "flex-row-reverse text-right",
                        sortable ? "cursor-pointer" : "cursor-default",
                      )}
                      aria-label={sortable ? `Sort by ${c.label}` : undefined}
                    >
                      {c.label}
                      {sortable ? (
                        sort?.key === c.key ? (
                          renderIcon(sort.dir === "asc" ? "arrow-up" : "arrow-down", "h-3 w-3")
                        ) : (
                          <span className="opacity-0 transition group-hover:opacity-50">
                            {renderIcon("arrow-up-down", "h-3 w-3")}
                          </span>
                        )
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const k = rowKey(row);
              const isSel = selected.has(k);
              return (
                <tr
                  key={k}
                  aria-selected={isSel || undefined}
                  onClick={onRowActivate ? () => onRowActivate(row) : undefined}
                  className={onRowActivate ? "cursor-pointer" : undefined}
                >
                  {selectable ? (
                    <td>
                      <input
                        type="checkbox"
                        checked={isSel}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setSelected((s) => {
                            const next = new Set(s);
                            if (e.currentTarget.checked) next.add(k);
                            else next.delete(k);
                            return next;
                          })
                        }
                        aria-label={`Select ${rowLabel ? rowLabel(row) : k}`}
                        className="h-4 w-4 cursor-pointer align-middle accent-[rgb(var(--primary))]"
                      />
                    </td>
                  ) : null}
                  {columns.map((c) => (
                    <td key={c.key} className={cn(c.align === "right" && "text-right", c.mono && "num")}>
                      {c.cell ? c.cell(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* < 768px: the same records as cards */}
      {mobileCard ? (
        <ul className="divide-y divide-outline md:hidden" aria-label={label}>
          {sorted.map((row) => (
            <li key={rowKey(row)}>
              <button
                type="button"
                onClick={() => onRowActivate?.(row)}
                className="press min-h-12 w-full px-4 py-3 text-left hover:bg-surface-2"
              >
                {mobileCard(row)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {footer ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline bg-surface-1 px-3 py-2.5 text-xs text-muted">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
