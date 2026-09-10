import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { dev }) => {
    if (!dev) {
      // Production builds resolve the mock worker to a no-op stub so MSW and
      // its handlers can never be bundled (ticket #38 prod-build audit).
      config.resolve.alias["@/lib/api/browser"] = path.resolve(
        __dirname,
        "src/lib/api/browser.prod.ts",
      );
    }
    return config;
  },
};

export default nextConfig;