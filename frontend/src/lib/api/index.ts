/**
 * Public API barrel (ticket #38).
 *
 * Deliberately does NOT re-export the MSW handlers — components never need
 * them, and importing this module in a production bundle must not pull in any
 * mock code. Mock concerns live in `./handlers`, `./server`, `./browser`.
 */

export { api, ApiError } from "./client";
export type { HttpMethod, RequestOptions, RequestBody } from "./client";
export { mockConfig, resetMockConfig, createDefaultMockConfig } from "./mockConfig";
export type { MockConfig, Scenario } from "./mockConfig";