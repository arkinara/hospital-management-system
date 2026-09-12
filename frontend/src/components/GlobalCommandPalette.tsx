/**
 * Global command palette (ticket #49).
 *
 * Mounted once in the (app) layout. Listens for ⌘K / Ctrl+K anywhere,
 * searches across destinations (routes), patients, widgets, and quick
 * actions.
 */

"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CommandPalette, type CommandItem } from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";
import { patients, widgets } from "@/lib/fixtures";

const DESTINATIONS: CommandItem[] = [
  { id: "go-dashboard", group: "Go to", label: "Dashboard", meta: "Main view", icon: "home", onRun: () => {} },
  { id: "go-patients", group: "Go to", label: "Patients", meta: "Directory", icon: "users", onRun: () => {} },
  { id: "go-appointments", group: "Go to", label: "Appointments", meta: "Schedule", icon: "calendar", onRun: () => {} },
  { id: "go-records", group: "Go to", label: "Medical records", meta: "Visit notes + prescriptions", icon: "file-text", onRun: () => {} },
  { id: "go-billing", group: "Go to", label: "Billing", meta: "Invoices + claims", icon: "receipt", onRun: () => {} },
  { id: "go-admin-users", group: "Go to", label: "Admin · Users", meta: "Admin only", icon: "user-cog", onRun: () => {} },
  { id: "go-admin-departments", group: "Go to", label: "Admin · Departments", meta: "Admin only", icon: "building", onRun: () => {} },
  { id: "go-admin-permissions", group: "Go to", label: "Admin · Permission matrix", meta: "Admin only", icon: "shield", onRun: () => {} },
  { id: "go-admin-widget-library", group: "Go to", label: "Admin · Widget library", meta: "Admin only", icon: "layout-grid", onRun: () => {} },
  { id: "go-admin-audit", group: "Go to", label: "Admin · Audit log", meta: "Admin only", icon: "history", onRun: () => {} },
];

const ACTIONS: CommandItem[] = [
  { id: "act-new-patient", group: "Actions", label: "Register new patient", meta: "Receptionist", icon: "user-plus", onRun: () => {} },
  { id: "act-book-appt", group: "Actions", label: "Book appointment", meta: "Receptionist", icon: "calendar-plus", onRun: () => {} },
  { id: "act-theme", group: "Actions", label: "Toggle light / dark", meta: "Theme", icon: "sun-moon", onRun: () => {} },
  { id: "act-signout", group: "Actions", label: "Sign out", meta: "Session", icon: "log-out", onRun: () => {} },
];

function destinationToPath(id: string): string {
  switch (id) {
    case "go-dashboard": return "/dashboard";
    case "go-patients": return "/patients";
    case "go-appointments": return "/appointments";
    case "go-records": return "/records";
    case "go-billing": return "/billing";
    case "go-admin-users": return "/admin/users";
    case "go-admin-departments": return "/admin/departments";
    case "go-admin-permissions": return "/admin/permissions";
    case "go-admin-widget-library": return "/admin/widget-library";
    case "go-admin-audit": return "/admin/audit";
    default: return "/dashboard";
  }
}

export default function GlobalCommandPalette(): JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isToggle = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isToggle) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("hospital:open-palette", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("hospital:open-palette", onOpenEvent);
    };
  }, [open]);

  // Patient items derived from fixtures (capped at 100)
  const patientItems: CommandItem[] = useMemo(
    () =>
      patients.slice(0, 100).map((p) => ({
        id: `p-${p.mrn}`,
        group: "Patients",
        label: p.name,
        meta: `${p.mrn} · ${p.dept}`,
        icon: "user",
        onRun: () => {},
      })),
    [],
  );

  const widgetItems: CommandItem[] = useMemo(
    () =>
      widgets.slice(0, 30).map((w) => ({
        id: `w-${w.key}`,
        group: "Widgets",
        label: w.name,
        meta: w.roles.join(", "),
        icon: w.icon || "layout",
        onRun: () => {},
      })),
    [],
  );

  const handleRun = useCallback(
    (item: CommandItem) => {
      setOpen(false);
      if (item.id.startsWith("go-")) {
        router.push(destinationToPath(item.id));
      } else if (item.id.startsWith("p-")) {
        const pid = item.id.slice(2);
        router.push(`/patients/${pid}`);
      } else if (item.id.startsWith("act-")) {
        // Hand off to the page via a custom event the destination page listens for
        window.dispatchEvent(new CustomEvent("hospital:action", { detail: item.id }));
      }
    },
    [router],
  );

  const items: CommandItem[] = useMemo(
    () =>
      [...DESTINATIONS, ...patientItems, ...widgetItems, ...ACTIONS].map(
        (it) => ({ ...it, onRun: () => handleRun(it) }),
      ),
    [patientItems, widgetItems, handleRun],
  );

  return (
    <CommandPalette
      open={open}
      onClose={() => setOpen(false)}
      items={items}
      renderIcon={renderIcon}
      placeholder="Search patients, actions, or destinations…"
      emptyHint="Try a name like ‘Alice’ or a route like ‘billing’."
    />
  );
}
/**
 * Hook variant for components that want to open the palette from a button
 * (e.g. the AppShell header's Search button). Returns an `open` callback.
 */
export function useCommandPalette(): { open: () => void } {
  return { open: () => window.dispatchEvent(new CustomEvent("hospital:open-palette")) };
}
