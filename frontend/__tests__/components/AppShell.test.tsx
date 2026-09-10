import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppShell, type NavItem } from "@/components/ui";
import { permissions, renderIcon } from "./testUtils";

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: "activity", href: "#d" },
  { key: "patients", label: "Patients", icon: "users", href: "#p", module: "Patients" },
  { key: "billing", label: "Billing", icon: "receipt-text", href: "#b", module: "Billing" },
  { key: "admin", label: "Admin", icon: "shield-check", href: "#a", module: "Admin" },
];

function renderShell(overrides: Partial<React.ComponentProps<typeof AppShell>> = {}) {
  const props = {
    title: "Dashboard",
    subtitle: "Overview",
    active: "dashboard",
    nav: NAV,
    session: { name: "Dr. Ayu Pratama", role: "Doctor" as const, dept: "General" },
    permissions,
    density: "comfortable" as const,
    isDark: false,
    onToggleDensity: vi.fn(),
    onToggleTheme: vi.fn(),
    onOpenPalette: vi.fn(),
    onSwitchRole: vi.fn(),
    onSignOut: vi.fn(),
    renderIcon,
    children: <p>Page content</p>,
    ...overrides,
  };
  render(<AppShell {...props} />);
  return props;
}

describe("AppShell", () => {
  it("starts with a skip link and exactly one h1", () => {
    renderShell();
    expect(screen.getByRole("link", { name: /skip to main content/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
  });

  it("derives navigation from the permission matrix", () => {
    renderShell();
    // Doctor has no `view` grant for Admin, so the destination must not appear.
    expect(screen.queryAllByRole("link", { name: "Admin" })).toHaveLength(0);
    expect(screen.getAllByRole("link", { name: "Patients" }).length).toBeGreaterThan(0);
  });

  it("marks the active destination with aria-current", () => {
    renderShell({ active: "patients" });
    const active = screen.getAllByRole("link", { name: "Patients" })[0];
    expect(active).toHaveAttribute("aria-current", "page");
  });

  it("wires the density and theme controls", () => {
    const props = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Toggle row density" }));
    expect(props.onToggleDensity).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(props.onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it("separates sign-out and calls it", () => {
    const props = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(props.onSignOut).toHaveBeenCalledTimes(1);
  });

  it("switches role from the account menu", () => {
    const props = renderShell();
    fireEvent.click(screen.getByRole("button", { name: /ayu pratama/i }));
    const nurse = screen.getByRole("menuitemradio", { name: "Nurse" });
    fireEvent.click(nurse);
    expect(props.onSwitchRole).toHaveBeenCalledWith("Nurse");
  });

  it("renders the toolbar and content slots", () => {
    renderShell({ toolbar: <span>Toolbar</span> });
    expect(screen.getByText("Toolbar")).toBeInTheDocument();
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });
});
