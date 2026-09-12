import React from "react";
import { render, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import axe, { type AxeResults } from "axe-core";

export type AxeViolation = AxeResults["violations"][number];
export type AxePass = AxeResults["passes"][number];

/**
 * Run axe-core against the rendered container and return serious/critical
 * violations plus the full pass list.
 */
export async function axeScan(
  container: HTMLElement,
): Promise<{ violations: AxeViolation[]; passes: AxePass[] }> {
  const res = await axe.run(container, {
    // jsdom cannot compute real colour contrast, so contrast rules are
    // covered by the token contract (verified by the hex-colour grep gate)
    // and a tokens test rather than a rendered check.
    rules: {
      "color-contrast": { enabled: false },
    },
  });
  return {
    violations: res.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    passes: res.passes,
  };
}

/** Render a page and wait until its data-driven content is present. */
export async function renderPageAxe(
  node: React.ReactElement,
  readyTest: () => boolean,
): Promise<HTMLElement> {
  const { container } = render(node);
  await waitFor(() => expect(readyTest()).toBe(true), { timeout: 8000 });
  return container;
}

/** Shared assertion: no serious/critical axe violations. */
export function assertNoViolations(result: { violations: AxeViolation[] }): void {
  const summary = result.violations
    .map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`)
    .join("\n");
  expect(summary, `axe violations:\n${summary}`).toBe("");
}