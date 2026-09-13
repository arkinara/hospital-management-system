/**
 * Browser-side MSW worker for development (ticket #38).
 *
 * Imported only from `MockServiceWorker`, which is gated on
 * `NODE_ENV === "development"`. In production the webpack alias in
 * `next.config.mjs` swaps this module for `browser.prod.ts`, so no MSW code
 * (or handler) can reach a production bundle.
 */

import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

/**
 * Kill switch: when `NEXT_PUBLIC_API_MOCK=off` the worker is left stopped so
 * every request falls through to the real API (used by the e2e-live run).
 * Any other value (unset in dev) keeps the mock layer on.
 */
export function startMockWorker(): Promise<unknown> {
  if (process.env.NEXT_PUBLIC_API_MOCK === "off") {
    return Promise.resolve();
  }
  return worker.start({
    onUnhandledRequest: "bypass",
    quiet: true,
  });
}
