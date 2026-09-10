import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "src");
const tokensCss = fs.readFileSync(path.join(srcDir, "styles", "tokens.css"), "utf8");
const motionCss = fs.readFileSync(path.join(srcDir, "styles", "motion.css"), "utf8");

const block = (css: string, selector: RegExp): string => css.match(selector)?.[1] ?? "";

const light = block(tokensCss, /:root\s*\{([\s\S]*?)\}/);
const dark = block(tokensCss, /\.dark\s*\{([\s\S]*?)\}/);

const COLOUR_TOKENS = [
  "--bg",
  "--fg",
  "--fg-muted",
  "--fg-subtle",
  "--primary",
  "--primary-fg",
  "--primary-container",
  "--primary-container-fg",
  "--accent",
  "--accent-fg",
  "--accent-container",
  "--accent-container-fg",
  "--outline",
  "--outline-strong",
  "--s0",
  "--s1",
  "--s2",
  "--s3",
  "--s4",
  "--success",
  "--success-container",
  "--success-container-fg",
  "--warning",
  "--warning-container",
  "--warning-container-fg",
  "--danger",
  "--danger-container",
  "--danger-container-fg",
  "--info",
  "--info-container",
  "--info-container-fg",
  "--focus",
  "--scrim",
  "--scrim-alpha",
];

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });

describe("design tokens", () => {
  it("defines every semantic colour in the light palette", () => {
    for (const token of COLOUR_TOKENS) {
      expect(light, `missing ${token} in :root`).toContain(`${token}:`);
    }
  });

  it("defines every semantic colour separately in the dark palette (no inversion)", () => {
    for (const token of COLOUR_TOKENS) {
      expect(dark, `missing ${token} in .dark`).toContain(`${token}:`);
    }
  });

  it("does not alias dark to light via a filter or invert", () => {
    expect(dark).not.toMatch(/filter\s*:\s*invert/);
    expect(dark).not.toContain("var(--bg)");
  });

  it("defines both density modes and gates compact at >= 1024px", () => {
    expect(tokensCss).toContain(".density-comfortable");
    expect(tokensCss).toContain(".density-compact");
    expect(tokensCss).toMatch(/@media \(min-width: 1024px\)/);
    expect(tokensCss).toContain("--row-h: 52px");
    expect(tokensCss).toContain("--row-h: 40px");
    for (const v of ["--cell-py", "--card-pad", "--gap", "--cell-fs"]) {
      expect(tokensCss).toContain(`${v}:`);
    }
  });

  it("defines the shape and z-index scales", () => {
    for (const v of ["--radius-sm", "--radius-md", "--radius-2xl", "--radius-pill"]) {
      expect(tokensCss).toContain(`${v}:`);
    }
    for (const v of ["--z-nav", "--z-sticky", "--z-fab", "--z-scrim", "--z-overlay", "--z-toast"]) {
      expect(tokensCss).toContain(`${v}:`);
    }
  });

  it("defines the motion tier and a reduced-motion collapse", () => {
    for (const v of [
      "--motion-duration-short1",
      "--motion-duration-short2",
      "--motion-duration-medium1",
      "--motion-duration-medium2",
      "--motion-duration-long1",
      "--motion-duration-long2",
      "--motion-easing-standard",
    ]) {
      expect(motionCss).toContain(`${v}:`);
    }
    expect(motionCss).toContain("prefers-reduced-motion: reduce");
    // Reduced motion must replace the shimmer with a static block.
    expect(motionCss).toMatch(/\.skel\s*\{[^}]*animation:\s*none/);
  });

  it("keeps raw hex literals out of every source file except the token seed", () => {
    const files = walk(srcDir).filter((f) => /\.(ts|tsx|css)$/.test(f));
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith(path.join("styles", "tokens.css"))) continue;
      const text = fs.readFileSync(file, "utf8");
      if (/#[0-9a-fA-F]{6}\b/.test(text)) offenders.push(path.relative(root, file));
    }
    expect(offenders).toEqual([]);
    // And the seed block is genuinely the one place they live.
    expect(tokensCss).toMatch(/#[0-9a-fA-F]{6}\b/);
  });
});
