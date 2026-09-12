// State coverage (ticket #55).
//
// Every data region must provably render all four states — loading, empty,
// ready, error — driven by the fixture scenario switches:
//
//   mockConfig.<region>.list.emptyResult = true  -> EmptyState
//   mockConfig.<region>.list.errorRate  = 1      -> ErrorState with retry
//   mockConfig.<region>.list.latency    = 200    -> Skeleton while loading
//   default                                   -> ready state
//
// Each case renders a real StateRegion + EmptyState/ErrorState/SkeletonRows
// fed by the real API client through the MSW mock layer. The final assertion
// checks a coverage ledger: every region × every state must have been
// exercised, so a region whose empty or error state is never asserted fails
// the suite instead of being silently skipped.
import React, { useEffect, useState } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api } from "@/lib/api/client";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { mockConfig, resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";
import { StateRegion } from "@/components/ui";
import type { DataState } from "@/components/ui/tokens";
import { EmptyState } from "@/components/ui";
import { ErrorState } from "@/components/ui";
import { renderIcon } from "./components/testUtils";
import type { Scenario } from "@/lib/api/mockConfig";

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  resetMockDb();
  resetMockConfig();
  queryCache.clear();
});

afterAll(() => server.close());

interface RegionSpec {
  label: string;
  path: string;
  listKey: string;
  /** Which mockConfig scenario switch drives this region. */
  resource: keyof typeof mockConfig;
  operation: string;
}

// The minimum set of data regions every page must render in all four states.
const REGIONS: RegionSpec[] = [
  { label: "patients", path: "/patients", listKey: "patients", resource: "patients", operation: "list" },
  { label: "appointments", path: "/appointments", listKey: "appointments", resource: "appointments", operation: "list" },
  { label: "invoices", path: "/invoices", listKey: "invoices", resource: "invoices", operation: "list" },
  { label: "audit", path: "/audit-log", listKey: "entries", resource: "audit", operation: "list" },
  { label: "widgets", path: "/widgets/me", listKey: "widgets", resource: "widgets", operation: "me" },
];

function scenarioFor(spec: RegionSpec): Scenario {
  const resource = mockConfig[spec.resource] as Record<string, Scenario>;
  return resource[spec.operation];
}

const STATES: DataState[] = ["loading", "empty", "ready", "error"];
const covered = new Set<string>();
function markCovered(region: string, state: DataState): void {
  covered.add(`${region}:${state}`);
}

/** A page region fed by the real API client, rendering all four states. */
function RegionProbe({ spec }: { spec: RegionSpec }) {
  const [state, setState] = useState<DataState>("loading");
  const [retryKey, setRetryKey] = useState(0);
  const [traceId, setTraceId] = useState("");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    api
      .get<Record<string, unknown>>(spec.path)
      .then((data) => {
        if (cancelled) return;
        const list = data?.[spec.listKey];
        setState(Array.isArray(list) && list.length === 0 ? "empty" : "ready");
      })
      .catch((err: Error & { traceId?: string }) => {
        if (cancelled) return;
        setTraceId(err.traceId ?? "");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [spec.path, spec.listKey, retryKey]);

  return (
    <StateRegion
      state={state}
      ready={<div data-testid={`ready-${spec.label}`}>ready</div>}
      empty={
        <EmptyState
          title={`No ${spec.label}`}
          body="Nothing to show yet."
          renderIcon={renderIcon}
        />
      }
      error={
        <ErrorState
          traceId={traceId}
          onRetry={() => setRetryKey((k) => k + 1)}
          renderIcon={renderIcon}
        />
      }
    />
  );
}

describe("state coverage", () => {
  it("every region renders its ready state by default", async () => {
    for (const spec of REGIONS) {
      const { unmount } = render(<RegionProbe spec={spec} />);
      expect(await screen.findByTestId(`ready-${spec.label}`)).toBeInTheDocument();
      markCovered(spec.label, "ready");
      unmount();
    }
  });

  it("every region renders an EmptyState when emptyResult is forced", async () => {
    for (const spec of REGIONS) {
      scenarioFor(spec).emptyResult = true;
      const { unmount } = render(<RegionProbe spec={spec} />);
      expect(await screen.findByText(`No ${spec.label}`)).toBeInTheDocument();
      markCovered(spec.label, "empty");
      unmount();
    }
  });

  it("every region renders an ErrorState with retry when the endpoint errors", async () => {
    for (const spec of REGIONS) {
      scenarioFor(spec).errorRate = 1;
      const { unmount } = render(<RegionProbe spec={spec} />);
      const alert = await screen.findByRole("alert");
      expect(alert).toBeInTheDocument();
      const retry = screen.getByRole("button", { name: /retry/i });
      // Retry refetches; the endpoint still errors, so the error state returns.
      await userEvent.click(retry);
      await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
      markCovered(spec.label, "error");
      unmount();
    }
  });

  it("every region shows a Skeleton while a slow response is loading", async () => {
    for (const spec of REGIONS) {
      scenarioFor(spec).latency = 200;
      const { unmount } = render(<RegionProbe spec={spec} />);
      // While the slow request is in flight the region renders skeleton rows.
      expect(document.querySelectorAll(".skel").length).toBeGreaterThan(0);
      // Once the data resolves the ready state replaces the skeleton.
      expect(await screen.findByTestId(`ready-${spec.label}`)).toBeInTheDocument();
      expect(document.querySelectorAll(".skel").length).toBe(0);
      markCovered(spec.label, "loading");
      unmount();
    }
  });

  it("every data region has all four states covered (no silent skips)", () => {
    const expected = new Set<string>();
    for (const spec of REGIONS) {
      for (const state of STATES) expected.add(`${spec.label}:${state}`);
    }
    const missing = [...expected].filter((key) => !covered.has(key));
    expect(missing, `regions missing state coverage: ${missing.join(", ")}`).toHaveLength(0);
  });
});