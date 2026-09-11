// Tests for the FE data layer (ticket #39).
// Covers error normalisation, query cache + invalidation, and the typed client
// contract. Pure JS — no API server required.
import { describe, expect, it, beforeEach } from "vitest";

import {
  normaliseError,
  normaliseNetworkError,
  type NormalisedError,
} from "@/lib/api/errors";
import {
  queryCache,
  queryKeys,
  invalidateQueries,
  setOptimistic,
} from "@/lib/api/queryCache";

describe("error normalisation", () => {
  it("normalises 401 to sign-in recovery", () => {
    const e = normaliseError(401, {
      error: { code: "http_401", message: "Not authenticated", trace_id: "abc-123" },
    });
    expect(e.title).toBe("Sign-in required");
    expect(e.recovery).toEqual({ kind: "sign-in" });
    expect(e.code).toBe("http_401");
    expect(e.traceId).toBe("abc-123");
    expect(e.transient).toBe(false);
  });

  it("normalises 422 with field errors", () => {
    const e = normaliseError(422, {
      error: {
        code: "validation_error",
        message: [
          { type: "missing", loc: ["body", "email"], msg: "Field required" },
          { type: "value_error", loc: ["body", "phone"], msg: "Invalid format" },
        ],
      },
    });
    expect(e.title).toBe("Validation error");
    expect(e.fieldErrors).toEqual({
      email: "Field required",
      phone: "Invalid format",
    });
    expect(e.recovery).toEqual({ kind: "field", field: "email", message: "Field required" });
  });

  it("normalises 500 to contact-support", () => {
    const e = normaliseError(500, {
      error: { code: "http_500", message: "Server error", trace_id: "" },
    });
    expect(e.title).toBe("Server error");
    expect(e.recovery).toEqual({ kind: "contact-support" });
    expect(e.transient).toBe(true);  // 5xx is transient
  });

  it("normalises 0 status (network) to retry", () => {
    const e = normaliseNetworkError(new TypeError("fetch failed"));
    expect(e.status).toBe(0);
    expect(e.recovery).toEqual({ kind: "retry" });
    expect(e.transient).toBe(true);
  });

  it("treats unknown shape as generic", () => {
    const e = normaliseError(418, { whatever: "this is teapot" });
    expect(e.status).toBe(418);
    expect(e.title).toMatch(/Error|418/);
    expect(e.recovery).toEqual({ kind: "none" });
  });

  it("flags 5xx and network as transient", () => {
    expect(normaliseError(502, {}).transient).toBe(true);
    expect(normaliseError(503, {}).transient).toBe(true);
    expect(normaliseError(0, {}).transient).toBe(true);
    expect(normaliseError(400, {}).transient).toBe(false);
    expect(normaliseError(409, {}).transient).toBe(false);
  });
});

describe("query cache", () => {
  beforeEach(() => {
    queryCache.clear();
  });

  it("stores and retrieves a value", () => {
    const k = queryKeys.patient(1);
    queryCache.set(k, { id: 1, name: "Alice" });
    expect(queryCache.get(k)).toEqual({ id: 1, name: "Alice" });
  });

  it("invalidates by prefix", () => {
    queryCache.set(queryKeys.patient(1), { id: 1 });
    queryCache.set(queryKeys.patient(2), { id: 2 });
    queryCache.set(queryKeys.departments(), [{ id: 10 }]);
    invalidateQueries(["patients"]);
    expect(queryCache.get(queryKeys.patient(1))).toBeUndefined();
    expect(queryCache.get(queryKeys.patient(2))).toBeUndefined();
    expect(queryCache.get(queryKeys.departments())).toEqual([{ id: 10 }]);
  });

  it("optimistic update can roll back", () => {
    const k = queryKeys.invoice(42);
    queryCache.set(k, { status: "unpaid", amount: 100 });
    setOptimistic(k, { status: "paid", amount: 100 });
    expect((queryCache.get(k) as { status: string }).status).toBe("paid");
    // Simulate mutation failure by re-calling the rollback returned
    // (caller is responsible for invoking it on error)
    const rollback = setOptimistic(k, { status: "void", amount: 0 });
    expect((queryCache.get(k) as { status: string }).status).toBe("void");
    rollback();
    expect((queryCache.get(k) as { status: string }).status).toBe("unpaid");
  });

  it("clears all on demand", () => {
    queryCache.set(queryKeys.me(), { id: 1 });
    queryCache.set(queryKeys.departments(), []);
    queryCache.clear();
    expect(queryCache.get(queryKeys.me())).toBeUndefined();
    expect(queryCache.get(queryKeys.departments())).toBeUndefined();
  });
});

describe("query keys", () => {
  it("returns stable, distinct references for distinct inputs", () => {
    expect(queryKeys.patient(1)).toEqual(queryKeys.patient(1));
    expect(queryKeys.patient(1)).not.toEqual(queryKeys.patient(2));
    expect(queryKeys.patient(1)).not.toEqual(queryKeys.patientTimeline(1));
  });
});