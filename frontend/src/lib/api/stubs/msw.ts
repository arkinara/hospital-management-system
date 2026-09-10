/**
 * Production stub for `msw` (ticket #38).
 *
 * `next.config.mjs` aliases `msw` to this module for non-dev builds so a
 * production bundle provably contains no MSW code. Handlers are never executed
 * in production; the stubs exist only to satisfy module shape if the mock
 * graph were ever bundled.
 */

const METHOD_NAMES = ["all", "head", "get", "post", "put", "delete", "patch", "options"] as const;

type HttpMethodFn = (...args: unknown[]) => unknown;

const http: Record<(typeof METHOD_NAMES)[number], HttpMethodFn> = Object.fromEntries(
  METHOD_NAMES.map((name) => [name, () => ({})]),
) as Record<(typeof METHOD_NAMES)[number], HttpMethodFn>;

export const delay = async (): Promise<void> => undefined;

export const HttpResponse = {
  json: (body?: unknown, init?: unknown): unknown => ({ body, init }),
} as const;

export { http };