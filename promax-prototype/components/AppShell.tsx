import React from 'react';
import { cn } from './cn';
import { can, type Density, type ModuleName, type PermissionMatrixData, type Role } from './tokens';
import type { IconRenderer } from './StatusChip';

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
    .replace(/^Dr\.?\s*/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
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
    () => nav.filter((n) => !n.module || can(permissions[session.role][n.module], 'view')),
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
                href={n.href ?? '#'}
                aria-current={on ? 'page' : undefined}
                aria-disabled={n.href ? undefined : true}
                className={cn(
                  'relative flex items-center gap-2.5 rounded-lg px-2.5 min-h-11 text-base press',
                  on
                    ? 'bg-primary-container text-primary-container-foreground font-semibold'
                    : n.href
                      ? 'text-foreground hover:bg-surface-3 font-medium'
                      : 'text-subtle cursor-not-allowed',
                )}
              >
                {on ? (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary" aria-hidden />
                ) : null}
                {renderIcon(n.icon, 'w-4.5 h-4.5 shrink-0')}
                <span className="truncate">{n.label}</span>
              </a>
            </li>
          );
        }
        const groupOpen = n.key === active || n.children.some((c) => c.key === active);
        return (
          <li key={n.key}>
            <details open={groupOpen} className="group">
              <summary className="flex items-center gap-2.5 rounded-lg px-2.5 min-h-11 text-base font-medium cursor-pointer press hover:bg-surface-3 marker:content-none">
                {renderIcon(n.icon, 'w-4.5 h-4.5 shrink-0')}
                <span className="flex-1 truncate">{n.label}</span>
                {renderIcon('chevron-down', 'w-4 h-4 text-muted transition group-open:rotate-180')}
              </summary>
              <ul className="mt-0.5 space-y-0.5">
                {n.children.map((c) => {
                  const on = c.key === active;
                  return (
                    <li key={c.key}>
                      <a
                        href={c.href}
                        aria-current={on ? 'page' : undefined}
                        className={cn(
                          'relative flex items-center gap-2.5 rounded-lg pl-8 pr-2.5 min-h-11 text-base press',
                          on
                            ? 'bg-primary-container text-primary-container-foreground font-semibold'
                            : 'text-foreground hover:bg-surface-3 font-medium',
                        )}
                      >
                        {renderIcon(c.icon, 'w-4.5 h-4.5 shrink-0')}
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
    <div className="min-h-dvh flex bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:z-toast focus:top-3 focus:left-3 focus:px-4 focus:py-2.5 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:font-semibold"
      >
        Skip to main content
      </a>

      <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-surface-1 border-r border-outline sticky top-0 h-dvh">
        <div className="h-14 flex items-center gap-2.5 px-3 border-b border-outline shrink-0">
          <span className="w-8 h-8 rounded-lg bg-primary text-primary-foreground grid place-items-center shrink-0">
            {renderIcon('cross', 'w-4.5 h-4.5')}
          </span>
          <span className="leading-tight min-w-0">
            <span className="block text-base font-semibold font-display truncate">Sirkaya Hospital</span>
            <span className="block text-2xs text-muted truncate">Phase 1 · Pro Max</span>
          </span>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto p-2">
          {navList}
        </nav>
        <div className="p-2 border-t border-outline shrink-0">
          <div className="mt-1 pt-1 border-t border-outline">
            <button
              type="button"
              onClick={onSignOut}
              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 min-h-11 text-base text-danger hover:bg-danger-container press"
            >
              {renderIcon('log-out', 'w-4.5 h-4.5')}
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-nav h-14 shrink-0 bg-surface-1/95 backdrop-blur border-b border-outline flex items-center gap-2 px-3 sm:px-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            className="lg:hidden w-11 h-11 -ml-1 rounded-lg grid place-items-center hover:bg-surface-3 press"
          >
            {renderIcon('menu', 'w-5 h-5')}
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="text-md sm:text-lg font-semibold font-display truncate">{title}</h1>
            {subtitle ? <p className="hidden sm:block text-xs text-muted truncate">{subtitle}</p> : null}
          </div>

          <button
            type="button"
            onClick={onOpenPalette}
            className="hidden md:flex items-center gap-2 h-9 pl-2.5 pr-2 rounded-lg bg-surface-2 border border-outline text-muted hover:bg-surface-3 press min-w-56 text-left"
          >
            {renderIcon('search', 'w-4 h-4')}
            <span className="flex-1 text-base">Search patients, actions…</span>
            <kbd className="num text-2xs px-1.5 py-0.5 rounded bg-surface-0 border border-outline">⌘K</kbd>
          </button>

          <button
            type="button"
            onClick={onToggleDensity}
            aria-pressed={density === 'compact'}
            aria-label="Toggle row density"
            className={cn(
              'hidden sm:grid w-11 h-11 rounded-lg place-items-center hover:bg-surface-3 press',
              density === 'compact' ? 'text-primary' : 'text-muted',
            )}
          >
            {renderIcon('rows-3', 'w-5 h-5')}
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-11 h-11 rounded-lg grid place-items-center text-muted hover:bg-surface-3 press"
          >
            {renderIcon(isDark ? 'sun' : 'moon-star', 'w-5 h-5')}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2 h-11 pl-1 pr-1.5 sm:pr-2.5 rounded-lg hover:bg-surface-3 press"
            >
              <span
                className="w-8 h-8 shrink-0 rounded-full bg-primary-container text-primary-container-foreground grid place-items-center font-semibold text-xs"
                aria-hidden
              >
                {initials(session.name)}
              </span>
              <span className="hidden sm:block text-left leading-tight min-w-0">
                <span className="block text-base font-medium truncate max-w-32">{session.name}</span>
                <span className="block text-2xs text-muted truncate">
                  {session.role}
                  {session.dept !== '—' ? ` · ${session.dept}` : ''}
                </span>
              </span>
            </button>

            {menuOpen ? (
              <div role="menu" className="anim-in absolute right-0 top-12 w-64 rounded-xl border border-outline bg-surface-0 shadow-overlay p-1.5 z-overlay">
                <p className="px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">Preview as role</p>
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
                      'w-full flex items-center gap-2.5 px-2.5 min-h-11 rounded-lg text-base press',
                      r === session.role ? 'bg-primary-container text-primary-container-foreground font-semibold' : 'hover:bg-surface-2',
                    )}
                  >
                    <span className="flex-1 text-left">{r}</span>
                    {r === session.role ? renderIcon('check', 'w-4 h-4') : null}
                  </button>
                ))}
                <p className="px-2.5 pt-2 pb-1 text-xs text-muted border-t border-outline mt-1.5">
                  Navigation and page actions are derived from the role × module matrix, not hard-coded.
                </p>
              </div>
            ) : null}
          </div>
        </header>

        {toolbar ? (
          <div className="shrink-0 border-b border-outline bg-surface-2/60 px-3 sm:px-4 py-1.5 flex items-center gap-2 overflow-x-auto">
            {toolbar}
          </div>
        ) : null}

        <main id="main" className="flex-1 min-w-0 bg-background">
          {children}
        </main>

        <nav aria-label="Primary" className="lg:hidden sticky bottom-0 z-nav shrink-0 bg-surface-1/97 backdrop-blur border-t border-outline pb-safe">
          <ul className="flex">
            {primary.map((n) => {
              const on = n.key === active || (n.children ?? []).some((c) => c.key === active);
              return (
                <li key={n.key} className="flex-1">
                  <a
                    href={n.href ?? n.children?.[0]?.href ?? '#'}
                    aria-current={on ? 'page' : undefined}
                    className={cn(
                      'flex flex-col items-center justify-center gap-0.5 min-h-14 px-1 press',
                      on ? 'text-primary font-semibold' : 'text-muted',
                    )}
                  >
                    {renderIcon(n.icon, 'w-5 h-5')}
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
                  className="w-full flex flex-col items-center justify-center gap-0.5 min-h-14 px-1 text-muted press"
                >
                  {renderIcon('more-horizontal', 'w-5 h-5')}
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
            className="fixed inset-0 z-scrim lg:hidden anim-scrim"
            style={{ background: 'rgb(var(--scrim) / var(--scrim-alpha))' }}
            onClick={() => setDrawerOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="fixed inset-y-0 left-0 z-overlay w-72 max-w-[85vw] bg-surface-1 border-r border-outline shadow-overlay flex flex-col lg:hidden anim-sheet"
          >
            <div className="h-14 flex items-center gap-2.5 px-3 border-b border-outline shrink-0">
              <span className="flex-1 text-base font-semibold font-display">Sirkaya Hospital</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="w-11 h-11 -mr-2 rounded-lg grid place-items-center text-muted hover:bg-surface-3"
              >
                {renderIcon('x', 'w-5 h-5')}
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
