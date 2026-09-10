"use client";

import { useEffect } from "react";

/**
 * Starts the MSW mock worker in development so components built against the
 * real API client receive fixture data. Renders nothing.
 *
 * In a production build `process.env.NODE_ENV` is inlined as "production" and
 * the early return drops the dynamic import; `next.config.mjs` additionally
 * aliases `@/lib/api/browser` to a stub, so no mock code can ship.
 */
export function MockServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    let cancelled = false;
    void import("@/lib/api/browser").then(async ({ startMockWorker }) => {
      if (!cancelled) await startMockWorker();
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}