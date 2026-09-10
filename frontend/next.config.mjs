import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @type {import('next').NextConfig}
 *
 * Production builds must be provably free of the mock layer (ticket #38):
 * - `mockworker` (the dev mock worker bootstrap) is aliased to a no-op stub in
 *   production, so the handlers it imports never enter a bundle;
 * - `msw/browser` and `msw` are aliased to stubs so no MSW library code can
 *   reach a bundle even if the mock module graph were ever imported.
 *
 * A bare `mockworker` specifier is used instead of `@/lib/api/browser` because
 * Next's own `@/*` path alias takes precedence and defeats a same-prefix alias.
 */
const nextConfig = {
  webpack: (config, { dev }) => {
    config.resolve.alias["mockworker"] = path.resolve(
      __dirname,
      dev ? "src/lib/api/browser.ts" : "src/lib/api/browser.prod.ts",
    );
    if (!dev) {
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