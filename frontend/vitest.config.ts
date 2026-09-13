import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const alias = { "@": path.resolve(root, "src") };

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
    ],
  },
});
