import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
    },
  },
  test: {
    environment: "node",
    // Component tests (ticket #37) run in jsdom; API/handler tests stay in node.
    environmentMatchGlobs: [
      ["__tests__/components/**", "jsdom"],
      ["**/*.test.tsx", "jsdom"],
    ],
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 20000,
  },
});