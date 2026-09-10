/**
 * Production stub for `msw/browser` (ticket #38).
 *
 * `next.config.mjs` aliases `msw/browser` to this module for non-dev builds so
 * no MSW library code can ship, even if the mock module graph were reached.
 * The real worker only ever runs under `setupWorker` in development.
 */

type WorkerLike = { start: () => Promise<void> };

export function setupWorker(..._handlers: unknown[]): WorkerLike {
  return { start: async () => undefined };
}