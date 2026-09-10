import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppShell, type Role } from "@/components/ui";
import { PERMISSION_MATRIX } from "@/lib/auth/matrix";
import { SHELL_NAV, hasModuleAccess } from "@/lib/auth/nav";
import { useTheme } from "@/hooks/useTheme";
import { useDensity } from "@/hooks/useDensity";
import { renderIcon } from "./testUtils";

const NAMES: Record<Role, string> = {
  Admin: "Rahmat Hidayat",
  Doctor: "Dr. Sari Wibowo",
  Nurse: "Wati Lestari",
  Receptionist: "Ika Permata",
};

function renderForRole(role: Role) {
  render(
    <AppShell
      title="Dashboard"
      active="dashboard"
      nav={SHELL_NAV}
      session={{ name: NAMES[role], role, dept: "—" }}
      permissions={PERMISSION_MATRIX}
      density="comfortable"
      isDark={false}
      onToggleDensity={vi.fn()}
      onToggleTheme={vi.fn()}
      onOpenPalette={vi.fn()}
      onSwitchRole={vi.fn()}
      onSignOut={vi.fn()}
      renderIcon={renderIcon}
    >
      <p>Page content</p>
    </AppShell>,
  );
}

const linkCount = (name: string) => screen.queryAllByRole("link", { name }).length;

describe("role-based sidebar from the fixture matrix", () => {
  it("Admin sees every module entry including Admin", () => {
    renderForRole("Admin");
    expect(linkCount("Patients")).toBeGreaterThan(0);
    expect(linkCount("Appointments")).toBeGreaterThan(0);
    expect(linkCount("Records")).toBeGreaterThan(0);
    expect(linkCount("Billing")).toBeGreaterThan(0);
    // Admin is a disclosure whose children are the links.
    expect(linkCount("Users")).toBeGreaterThan(0);
    expect(linkCount("Permissions")).toBeGreaterThan(0);
  });

  it("Doctor sees Patients/Appointments/Records/Dashboard but not Admin or Billing", () => {
    renderForRole("Doctor");
    expect(linkCount("Patients")).toBeGreaterThan(0);
    expect(linkCount("Appointments")).toBeGreaterThan(0);
    expect(linkCount("Records")).toBeGreaterThan(0);
    expect(linkCount("Billing")).toBe(0);
    expect(linkCount("Users")).toBe(0);
  });

  it("Nurse sees Appointments and Records but not Billing or Admin", () => {
    renderForRole("Nurse");
    expect(linkCount("Patients")).toBeGreaterThan(0);
    expect(linkCount("Records")).toBeGreaterThan(0);
    expect(linkCount("Appointments")).toBeGreaterThan(0);
    expect(linkCount("Billing")).toBe(0);
    expect(linkCount("Users")).toBe(0);
  });

  it("Receptionist sees Billing but not Records or Admin", () => {
    renderForRole("Receptionist");
    expect(linkCount("Patients")).toBeGreaterThan(0);
    expect(linkCount("Appointments")).toBeGreaterThan(0);
    expect(linkCount("Billing")).toBeGreaterThan(0);
    expect(linkCount("Records")).toBe(0);
    expect(linkCount("Users")).toBe(0);
  });
});

describe("hasModuleAccess", () => {
  it("grants Admin the Admin module and denies Doctor", () => {
    expect(hasModuleAccess("Admin", "Admin", PERMISSION_MATRIX)).toBe(true);
    expect(hasModuleAccess("Doctor", "Admin", PERMISSION_MATRIX)).toBe(false);
  });

  it("treats ungated (null) modules as visible", () => {
    expect(hasModuleAccess("Nurse", null, PERMISSION_MATRIX)).toBe(true);
  });

  it("fails closed when the matrix entry is missing", () => {
    expect(hasModuleAccess("Doctor", "Admin", {} as typeof PERMISSION_MATRIX)).toBe(false);
  });
});

describe("theme and density integration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("hms-theme", "system");
    window.localStorage.setItem("hms-density", "comfortable");
    document.documentElement.className = "";
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.themePref;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  });

  function ThemeHarness() {
    const { isDark, toggleTheme } = useTheme();
    return (
      <button type="button" onClick={toggleTheme}>
        {isDark ? "dark" : "light"}
      </button>
    );
  }

  function DensityHarness() {
    const { effectiveDensity, toggleDensity } = useDensity();
    return (
      <button type="button" onClick={toggleDensity}>
        {effectiveDensity}
      </button>
    );
  }

  it("theme toggle flips data-theme on <html>", () => {
    render(<ThemeHarness />);
    expect(document.documentElement.dataset.theme).toBe("light");
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("density toggle does not go compact below 1024px", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 500 });
    render(<DensityHarness />);
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.classList.contains("density-compact")).toBe(false);
    expect(document.documentElement.dataset.density).toBe("comfortable");
  });

  it("density toggle applies compact at >= 1024px", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1280 });
    render(<DensityHarness />);
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.classList.contains("density-compact")).toBe(true);
  });
});
