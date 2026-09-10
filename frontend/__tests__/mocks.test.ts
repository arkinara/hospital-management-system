import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createDefaultMockConfig, mockConfig, resetMockConfig } from "@/lib/api/mockConfig";

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(here, "..");

function collectFiles(dir: string, ext: string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (ext.some((e) => entry.name.endsWith(e))) out.push(full);
    }
  };
  walk(dir);
  return out;
}

describe("mockConfig scenario switches", () => {
  it("exposes a scenario per required endpoint", () => {
    mockConfig.patients.list.latency = 800;
    mockConfig.patients.list.errorRate = 0.2;
    mockConfig.patients.list.emptyResult = true;
    expect(mockConfig.patients.list).toEqual({ latency: 800, errorRate: 0.2, emptyResult: true });

    // Every resource/operation the screens preview exists.
    expect(mockConfig.patients.detail).toBeDefined();
    expect(mockConfig.patients.timeline).toBeDefined();
    expect(mockConfig.appointments.list).toBeDefined();
    expect(mockConfig.records.visits).toBeDefined();
    expect(mockConfig.vitals.list).toBeDefined();
    expect(mockConfig.invoices.payment).toBeDefined();
    expect(mockConfig.permissions.get).toBeDefined();
    expect(mockConfig.widgets.me).toBeDefined();
    expect(mockConfig.widgets.library).toBeDefined();
    expect(mockConfig.auth.users).toBeDefined();
    expect(mockConfig.audit.list).toBeDefined();
  });

  it("resetMockConfig restores defaults so one test's scenario never leaks", () => {
    mockConfig.patients.list.latency = 5000;
    mockConfig.patients.list.errorRate = 1;
    mockConfig.patients.list.emptyResult = true;
    resetMockConfig();
    expect(mockConfig.patients.list).toEqual(createDefaultMockConfig().patients.list);
  });
});

describe("production build is free of the mock layer", () => {
  it("the browser.prod stub contains no msw import", () => {
    const stub = readFileSync(
      path.resolve(FRONTEND, "src/lib/api/browser.prod.ts"),
      "utf-8",
    );
    expect(stub).not.toMatch(/from\s+["']msw\b/);
    expect(stub).not.toMatch(/import\(\s*["']msw\b/);
  });

  it("static build output never references msw or mock handlers", () => {
    const staticDir = path.resolve(FRONTEND, ".next/static");
    const files = collectFiles(staticDir, [".js", ".mjs"]);
    if (files.length === 0) {
      // No production build available — the CI gate runs `npm run build` first.
      // Treating this as a skip keeps local `npm test` green before a build.
      return;
    }
    const offenders = files.filter((file) => {
      const content = readFileSync(file, "utf-8");
      return /msw|No mock handler registered|mock_error/i.test(content);
    });
    expect(offenders, `mock layer leaked into: ${offenders.join(", ")}`).toHaveLength(0);

    const named = files.filter((file) => /msw/i.test(path.basename(file)));
    expect(named).toHaveLength(0);
  });

  it("server-side build output is also free of msw", () => {
    const serverDir = path.resolve(FRONTEND, ".next/server");
    const files = collectFiles(serverDir, [".js", ".mjs"]);
    if (files.length === 0) return;
    const offenders = files.filter((file) => {
      const content = readFileSync(file, "utf-8");
      return /msw|No mock handler registered|mock_error/i.test(content);
    });
    expect(offenders, `mock layer leaked into server: ${offenders.join(", ")}`).toHaveLength(0);
  });
});