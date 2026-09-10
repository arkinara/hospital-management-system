/**
 * Production stub for the browser mock worker (ticket #38).
 *
 * `next.config.mjs` aliases `@/lib/api/browser` to this module whenever the
 * build is not a dev build. It contains no MSW import, so a production bundle
 * is provably free of mock handlers.
 */

export function startMockWorker(): Promise<void> {
  return Promise.resolve();
}
