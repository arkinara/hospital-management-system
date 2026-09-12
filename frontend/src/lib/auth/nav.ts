/**
 * Shell navigation configuration (ticket #1).
 *
 * The menu is defined once here and filtered at render time by `AppShell`
 * against the role × module matrix bridged in `matrix.ts`. Nothing in this file
 * hard-codes which role sees which destination — a nav item is visible only
 * when the signed-in role holds a `view` grant for its module.
 */

import { can } from "@/components/ui/tokens";
import type { ModuleName, NavItem, PermissionMatrixData, Role } from "@/components/ui";

/** Top-level destinations for Phase 1, mirroring the prototype shell. */
export const SHELL_NAV: NavItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: "layout-dashboard",
    href: "/dashboard",
    module: null,
  },
  { key: "patients", label: "Patients", icon: "users", href: "/patients", module: "Patients" },
  {
    key: "appointments",
    label: "Appointments",
    icon: "calendar-days",
    href: "/appointments",
    module: "Appointments",
  },
  { key: "records", label: "Records", icon: "file-text", href: "/records", module: "Records" },
  { key: "billing", label: "Billing", icon: "receipt-text", href: "/billing", module: "Billing" },
  {
    key: "admin",
    label: "Admin",
    icon: "shield-check",
    module: "Admin",
    children: [
      { key: "users", label: "Users", icon: "user-cog", href: "/admin/users" },
      { key: "departments", label: "Departments", icon: "building-2", href: "/admin/departments" },
      { key: "widgets", label: "Widget Library", icon: "layout-grid", href: "/admin/widget-library" },
      { key: "permissions", label: "Permissions", icon: "key-round", href: "/admin/permissions" },
      { key: "reports", label: "Reports", icon: "bar-chart-3", href: "/admin/reports" },
    ],
  },
];

interface RouteMeta {
  key: string;
  title: string;
  module: ModuleName | null;
}

/** Ordered route table; first prefix match wins, so `/admin/users` beats `/`. */
const ROUTES: Array<{ prefix: string; meta: RouteMeta }> = [
  { prefix: "/dashboard", meta: { key: "dashboard", title: "Dashboard", module: null } },
  { prefix: "/patients", meta: { key: "patients", title: "Patients", module: "Patients" } },
  {
    prefix: "/appointments",
    meta: { key: "appointments", title: "Appointments", module: "Appointments" },
  },
  { prefix: "/records", meta: { key: "records", title: "Records", module: "Records" } },
  {
    prefix: "/medical-records",
    meta: { key: "records", title: "Records", module: "Records" },
  },
  { prefix: "/billing", meta: { key: "billing", title: "Billing", module: "Billing" } },
  { prefix: "/admin", meta: { key: "admin", title: "Admin", module: "Admin" } },
  {
    prefix: "/not-authorized",
    meta: { key: "not-authorized", title: "Not authorised", module: null },
  },
];

const FALLBACK: RouteMeta = { key: "dashboard", title: "Dashboard", module: null };

function match(pathname: string): RouteMeta {
  const route = ROUTES.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  return route?.meta ?? FALLBACK;
}

/** The module a pathname is gated on, or `null` when the route is public. */
export function moduleForPath(pathname: string): ModuleName | null {
  return match(pathname).module;
}

/** The active nav key for a pathname, used for the highlighted destination. */
export function navKeyForPath(pathname: string): string {
  return match(pathname).key;
}

/** The page title for a pathname, rendered as the shell `h1`. */
export function titleForPath(pathname: string): string {
  return match(pathname).title;
}

/**
 * Whether `role` may view `module`.
 *
 * A missing role, module or grant resolves to `false` — never to full access.
 * `null` modules are ungated (Dashboard, the not-authorized screen).
 */
export function hasModuleAccess(
  role: Role,
  module: ModuleName | null,
  permissions: PermissionMatrixData,
): boolean {
  if (!module) return true;
  const grant = permissions?.[role]?.[module];
  return typeof grant === "string" && can(grant, "view");
}
