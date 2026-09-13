import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const alias = { "@": path.resolve(root, "src") };

/**
 * The e2e-live project runs the same journeys against a real backend. It is
 * opt-in so a plain `vitest --run` stays hermetic (MSW, no server): enable it
 * with `E2E_LIVE=1` or by naming it via `--project=e2e-live`. CI and
 * `scripts/run-e2e-live.sh` do the former.
 */
const liveRequested =
  process.env.E2E_LIVE === "1" ||
  process.argv.some((arg) => arg === "e2e-live" || arg.startsWith("--project=e2e-live"));

const e2eLiveProject = {
  resolve: { alias },
  test: {
    name: "e2e-live",
    environment: "jsdom" as const,
    include: ["__tests__/e2e-journeys.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    env: {
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
      NEXT_PUBLIC_API_MOCK: "off",
    },
    testTimeout: 30000,
  },
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "jsdom",
          include: [
            "__tests__/components/**/*.test.tsx",
            "__tests__/a11y/**/*.test.tsx",
            "__tests__/pages/**/*.test.tsx",
            "**/*.test.tsx",
          ],
          setupFiles: ["./vitest.setup.ts"],
          testTimeout: 20000,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "api",
          environment: "node",
          include: [
            "__tests__/api/**/*.test.ts",
            "__tests__/*.test.ts",
          ],
          testTimeout: 20000,
        },
      },
      ...(liveRequested ? [e2eLiveProject] : []),
    ],
  },
});
