/**
 * Node-side MSW server for tests (ticket #38).
 *
 * `server.listen()` in a test file, `resetMockDb()` between tests. The fallback
 * handler is last so an unhandled API path resolves to an explicit 404 rather
 * than hanging the request.
 */

import { setupServer } from "msw/node";
import { fallbackHandler, handlers } from "./handlers";

export const server = setupServer(...handlers, fallbackHandler);
