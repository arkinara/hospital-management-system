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

export function startMockWorker(): Promise<unknown> {
  return worker.start({
    onUnhandledRequest: "bypass",
    quiet: true,
  });
}
