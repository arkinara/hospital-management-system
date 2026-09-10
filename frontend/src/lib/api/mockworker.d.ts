/**
 * Ambient module for the mock-worker bootstrap (ticket #38).
 *
 * The browser mock worker is imported under the bare specifier `mockworker`
 * so `next.config.mjs` can alias it to the real worker in dev and a no-op stub
 * in production without clashing with Next's own `@/*` path alias.
 */

declare module "mockworker" {
  export function startMockWorker(): Promise<unknown>;
}