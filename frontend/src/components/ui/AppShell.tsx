"use client";

import React from "react";
import { cn } from "./cn";
import { can, type Density, type ModuleName, type PermissionMatrixData, type Role } from "./tokens";
import type { IconRenderer } from "./StatusChip";

export interface NavChild {
  key: string;
  label: string;
  icon: string;
  href: string;
}

export interface NavItem {
  key: string;
  label: string;
  icon: string;
  href?: string;
  /** Nav is derived from the permission matrix; a null module is always visible. */
  module?: ModuleName | null;
  children?: NavChild[];
}

export interface Session {
  name: string;
  role: Role;
  dept: string;
}

export interface AppShellProps {
  title: string;
  subtitle?: string;
  /** Key of the active nav item or child. */
  active: string;
  nav: NavItem[];
  session: Session;
  permissions: PermissionMatrixData;
  density: Density;
  isDark: boolean;
  onToggleDensity: () => void;
  onToggleTheme: () => void;
  onOpenPalette: () => void;
  onSwitchRole: (role: Role) => void;
  onSignOut: () => void;
  renderIcon: IconRenderer;
  /** Rendered under the header, e.g. the state review control. */
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}

const initials = (name: string): string =>
  name
    .replace(/^Dr\.?\s*/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/**
 * Application shell.
 *
 * Guarantees:
 *  - a skip link as the first focusable element
 *  - navigation **derived from the permission matrix**, so a role can never see a
 *    destination it has no `view` grant for; the interface check is a convenience
 *    and the API check remains the boundary
 *  - one `h1` per page, in the header
 *  - `aria-current="page"` on the active item, plus a left accent so the active
 *    state is not carried by colour alone
 *  - a mobile bottom bar capped at five items with an overflow drawer, never nested
 *    navigation inside a tab
 *  - sign-out separated from navigation by a divider so it is not mis-tapped
 */
export const AppShell: React.FC<AppShellProps> = ({
  title,
  subtitle,
  active,
  nav,
  session,
  permissions,
  density,
  isDark,
  onToggleDensity,
  onToggleTheme,
  onOpenPalette,
  onSwitchRole,
  onSignOut,
  renderIcon,
  toolbar,
  children,
}) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const visible = React.useMemo(
    () => nav.filter((n) => !n.module || can(permissions[session.role][n.module], "view")),
    [nav, permissions, session.role],
  );
  const primary = visible.slice(0, 4);
  const hasOverflow = visible.length > 4;

  const navList = (
    <ul className="space-y-0.5">
      {visible.map((n) => {
        if (!n.children) {
          const on = n.key === active;
          return (
            <li key={n.key}>
              <a
                href={n.href ?? "#"}
                aria-current={on ? "page" : undefined}
                aria-disabled={n.href ? undefined : true}
                className={cn(
                  "press relative flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-base",
                  on
                    ? "bg-primary-container font-semibold text-primary-container-foreground"
                    : n.href
                      ? "font-medium text-foreground hover:bg-surface-3"
                      : "cursor-not-allowed text-subtle",
                )}
              >
                {on ? (
                  <span
                    className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                    aria-hidden
                  />
                ) : null}
                {renderIcon(n.icon, "h-4.5 w-4.5 shrink-0")}
                <span className="truncate">{n.label}</span>
              </a>
            </li>
          );
        }
        const groupOpen = n.key === active || n.children.some((c) => c.key === active);
        return (
          <li key={n.key}>
            <details open={groupOpen} className="group">
              <summary className="press flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-base font-medium marker:content-none hover:bg-surface-3">
                {renderIcon(n.icon, "h-4.5 w-4.5 shrink-0")}
                <span className="flex-1 truncate">{n.label}</span>
                {renderIcon("chevron-down", "h-4 w-4 text-muted transition group-open:rotate-180")}
              </summary>
              <ul className="mt-0.5 space-y-0.5">
                {n.children.map((c) => {
                  const on = c.key === active;
                  return (
                    <li key={c.key}>
                      <a
                        href={c.href}
                        aria-current={on ? "page" : undefined}
                        className={cn(
                          "press relative flex min-h-11 items-center gap-2.5 rounded-lg py-0 pl-8 pr-2.5 text-base",
                          on
                            ? "bg-primary-container font-semibold text-primary-container-foreground"
                            : "font-medium text-foreground hover:bg-surface-3",
                        )}
                      >
                        {renderIcon(c.icon, "h-4.5 w-4.5 shrink-0")}
                        <span className="truncate">{c.label}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </details>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-toast focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2.5 focus:font-semibold focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-outline bg-surface-1 lg:flex">
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-outline px-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            {renderIcon("cross", "h-4.5 w-4.5")}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-display text-base font-semibold">
              Sirkaya Hospital
            </span>
            <span className="block truncate text-2xs text-muted">Phase 1 · Pro Max</span>
          </span>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto p-2">
          {navList}
        </nav>
        <div className="shrink-0 border-t border-outline p-2">
          <div className="mt-1 border-t border-outline pt-1">
            <button
              type="button"
              onClick={onSignOut}
              className="press flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-base text-danger hover:bg-danger-container"
            >
              {renderIcon("log-out", "h-4.5 w-4.5")}
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-nav flex h-14 shrink-0 items-center gap-2 border-b border-outline bg-surface-1/95 px-3 backdrop-blur sm:px-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            className="press -ml-1 grid h-11 w-11 place-items-center rounded-lg hover:bg-surface-3 lg:hidden"
          >
            {renderIcon("menu", "h-5 w-5")}
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-md font-semibold sm:text-lg">{title}</h1>
            {subtitle ? (
              <p className="hidden truncate text-xs text-muted sm:block">{subtitle}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onOpenPalette}
            className="press hidden min-w-56 items-center gap-2 rounded-lg border border-outline bg-surface-2 py-0 pl-2.5 pr-2 text-left text-muted hover:bg-surface-3 md:flex"
          >
            {renderIcon("search", "h-4 w-4")}
            <span className="flex-1 text-base">Search patients, actions…</span>
            <kbd className="num rounded border border-outline bg-surface-0 px-1.5 py-0.5 text-2xs">
              ⌘K
            </kbd>
          </button>

          <button
            type="button"
            onClick={onToggleDensity}
            aria-pressed={density === "compact"}
            aria-label="Toggle row density"
            className={cn(
              "press hidden h-11 w-11 place-items-center rounded-lg hover:bg-surface-3 sm:grid",
              density === "compact" ? "text-primary" : "text-muted",
            )}
          >
            {renderIcon("rows-3", "h-5 w-5")}
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="press grid h-11 w-11 place-items-center rounded-lg text-muted hover:bg-surface-3"
          >
            {renderIcon(isDark ? "sun" : "moon-star", "h-5 w-5")}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="press flex h-11 items-center gap-2 rounded-lg py-0 pl-1 pr-1.5 hover:bg-surface-3 sm:pr-2.5"
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-container text-xs font-semibold text-primary-container-foreground"
                aria-hidden
              >
                {initials(session.name)}
              </span>
              <span className="hidden min-w-0 text-left leading-tight sm:block">
                <span className="block max-w-32 truncate text-base font-medium">
                  {session.name}
                </span>
                <span className="block truncate text-2xs text-muted">
                  {session.role}
                  {session.dept !== "—" ? ` · ${session.dept}` : ""}
                </span>
              </span>
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="anim-in absolute right-0 top-12 z-overlay w-64 rounded-xl border border-outline bg-surface-0 p-1.5 shadow-overlay"
              >
                <p className="px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
                  Preview as role
                </p>
                {(Object.keys(permissions) as Role[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="menuitemradio"
                    aria-checked={r === session.role}
                    onClick={() => {
                      setMenuOpen(false);
                      onSwitchRole(r);
                    }}
                    className={cn(
                      "press flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-base",
                      r === session.role
                        ? "bg-primary-container font-semibold text-primary-container-foreground"
                        : "hover:bg-surface-2",
                    )}
                  >
                    <span className="flex-1 text-left">{r}</span>
                    {r === session.role ? renderIcon("check", "h-4 w-4") : null}
                  </button>
                ))}
                <p className="mt-1.5 border-t border-outline px-2.5 pb-1 pt-2 text-xs text-muted">
                  Navigation and page actions are derived from the role × module matrix, not
                  hard-coded.
                </p>
              </div>
            ) : null}
          </div>
        </header>

        {toolbar ? (
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-outline bg-surface-2/60 px-3 py-1.5 sm:px-4">
            {toolbar}
          </div>
        ) : null}

        <main id="main" className="min-w-0 flex-1 bg-background">
          {children}
        </main>

        <nav
          aria-label="Primary"
          className="sticky bottom-0 z-nav shrink-0 border-t border-outline bg-surface-1/97 pb-safe backdrop-blur lg:hidden"
        >
          <ul className="flex">
            {primary.map((n) => {
              const on = n.key === active || (n.children ?? []).some((c) => c.key === active);
              return (
                <li key={n.key} className="flex-1">
                  <a
                    href={n.href ?? n.children?.[0]?.href ?? "#"}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "press flex min-h-14 flex-col items-center justify-center gap-0.5 px-1",
                      on ? "font-semibold text-primary" : "text-muted",
                    )}
                  >
                    {renderIcon(n.icon, "h-5 w-5")}
                    <span className="text-2xs">{n.label}</span>
                  </a>
                </li>
              );
            })}
            {hasOverflow ? (
              <li className="flex-1">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="press flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-muted"
                >
                  {renderIcon("more-horizontal", "h-5 w-5")}
                  <span className="text-2xs">More</span>
                </button>
              </li>
            ) : null}
          </ul>
        </nav>
      </div>

      {drawerOpen ? (
        <>
          <div
            className="anim-scrim fixed inset-0 z-scrim lg:hidden"
            style={{ background: "rgb(var(--scrim) / var(--scrim-alpha))" }}
            onClick={() => setDrawerOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="anim-sheet fixed inset-y-0 left-0 z-overlay flex w-72 max-w-[85vw] flex-col border-r border-outline bg-surface-1 shadow-overlay lg:hidden"
          >
            <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-outline px-3">
              <span className="flex-1 font-display text-base font-semibold">Sirkaya Hospital</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="-mr-2 grid h-11 w-11 place-items-center rounded-lg text-muted hover:bg-surface-3"
              >
                {renderIcon("x", "h-5 w-5")}
              </button>
            </div>
            <nav aria-label="All destinations" className="flex-1 overflow-y-auto p-2">
              {navList}
            </nav>
          </div>
        </>
      ) : null}
    </div>
  );
};
