import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @type {import('next').NextConfig}
 *
 * Production builds must be provably free of the mock layer (ticket #38):
 * - `@/lib/api/browser` (the dev mock worker) is swapped for a no-op stub.
 * - `msw/browser` and `msw` are aliased to stubs so no MSW library code can
 *   reach a bundle even if the mock module graph were ever imported.
 */
const nextConfig = {
  webpack: (config, { dev }) => {
    if (!dev) {
      config.resolve.alias["@/lib/api/browser"] = path.resolve(
        __dirname,
        "src/lib/api/browser.prod.ts",
      );
      config.resolve.alias["msw/browser"] = path.resolve(
        __dirname,
        "src/lib/api/stubs/msw-browser.ts",
      );
      config.resolve.alias["msw"] = path.resolve(__dirname, "src/lib/api/stubs/msw.ts");
    }
    return config;
  },
};

export default nextConfig;