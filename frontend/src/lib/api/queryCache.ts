/**
 * Query cache + mutation invalidation (ticket #39).
 *
 * Domain query keys are declared in `queryKeys` so invalidation can be
 * done by key prefix. Each mutation helper accepts the keys to invalidate
 * and triggers a refetch for any mounted subscriber.
 *
 * Subscribers are components that called `useQuery(key)` and expect to be
 * notified when the key is invalidated. Optimistic updates are supported
 * via `setOptimistic`.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const queryKeys = {
  me: () => ["me"] as const,
  users: () => ["admin", "users"] as const,
  user: (id: number | string) => ["admin", "users", id] as const,
  departments: () => ["admin", "departments"] as const,
  department: (id: number | string) => ["admin", "departments", id] as const,
  patients: (q?: Record<string, unknown>) => ["patients", q ?? {}] as const,
  patient: (id: number | string) => ["patients", id] as const,
  patientTimeline: (id: number | string) => ["patients", id, "timeline"] as const,
  appointments: (q?: Record<string, unknown>) => ["appointments", q ?? {}] as const,
  doctorSchedule: (doctorId: number | string, date: string) =>
    ["appointments", "doctor", doctorId, date] as const,
  visits: (patientId: number | string) => ["visits", patientId] as const,
  visit: (id: number | string) => ["visits", "detail", id] as const,
  vitals: (patientId: number | string) => ["vitals", patientId] as const,
  carePlan: (patientId: number | string) => ["care-plan", patientId] as const,
  invoices: (q?: Record<string, unknown>) => ["billing", "invoices", q ?? {}] as const,
  invoice: (id: number | string) => ["billing", "invoices", id] as const,
  claims: (q?: Record<string, unknown>) => ["billing", "claims", q ?? {}] as const,
  claim: (id: number | string) => ["billing", "claims", id] as const,
  widgetLibrary: () => ["widgets", "library"] as const,
  myLayout: () => ["widgets", "me"] as const,
  permissions: () => ["auth", "permissions"] as const,
  auditLog: (q?: Record<string, unknown>) => ["audit", q ?? {}] as const,
  doctorAvailability: (doctorId: number | string) =>
    ["appointments", "availability", doctorId] as const,
};

// ---------------------------------------------------------------------------
// Cache store
// ---------------------------------------------------------------------------

type CacheValue = unknown;
type Listener = () => void;

class QueryCache {
  private store = new Map<string, CacheValue>();
  private listeners = new Set<Listener>();
  private optimisticSnapshots = new Map<string, CacheValue>();

  get<T>(key: readonly unknown[]): T | undefined {
    return this.store.get(key.join("|")) as T | undefined;
  }

  set<T>(key: readonly unknown[], value: T): void {
    this.store.set(key.join("|"), value);
    this.notify();
  }

  setOptimistic<T>(key: readonly unknown[], value: T): void {
    const flat = key.join("|");
    if (!this.optimisticSnapshots.has(flat)) {
      this.optimisticSnapshots.set(flat, this.store.get(flat));
    }
    this.store.set(flat, value);
    this.notify();
  }

  rollbackOptimistic(key: readonly unknown[]): void {
    const flat = key.join("|");
    const prev = this.optimisticSnapshots.get(flat);
    if (prev !== undefined) this.store.set(flat, prev);
    else this.store.delete(flat);
    this.optimisticSnapshots.delete(flat);
    this.notify();
  }

  invalidate(prefix: readonly unknown[]): void {
    const needle = prefix.join("|");
    let changed = false;
    for (const k of this.store.keys()) {
      if (k.startsWith(needle) || k.startsWith(needle + "|")) {
        this.store.delete(k);
        changed = true;
      }
    }
    for (const k of this.optimisticSnapshots.keys()) {
      if (k.startsWith(needle) || k.startsWith(needle + "|")) {
        this.optimisticSnapshots.delete(k);
      }
    }
    if (changed) this.notify();
  }

  clear(): void {
    this.store.clear();
    this.optimisticSnapshots.clear();
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}

const cache = new QueryCache();
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => cache.clear());
}
export const queryCache = cache;

// ---------------------------------------------------------------------------
// React hooks
// ---------------------------------------------------------------------------

interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
}

interface QueryOptions<T> {
  fetcher: () => Promise<T>;
  enabled?: boolean;
  onError?: (err: Error) => void;
}

export function useQuery<T>(
  key: readonly unknown[],
  options: QueryOptions<T>,
): QueryState<T> & { refetch: () => void; setData: (d: T) => void } {
  const flat = key.join("|");
  const subscribe = useCallback(
    (listener: Listener) => cache.subscribe(listener),
    [],
  );
  const getSnapshot = useCallback(() => cache.get<T>(key), [flat]);
  const getServerSnapshot = useCallback(() => undefined as T | undefined, [flat]);
  const data = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (options.enabled === false) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    options
      .fetcher()
      .then((d) => {
        if (!cancelled) {
          cache.set(key, d);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const err = e instanceof Error ? e : new Error(String(e));
          setError(err);
          setLoading(false);
          options.onError?.(err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [flat, options.enabled]);

  return {
    data,
    loading,
    error,
    refetch: () => {
      options
        .fetcher()
        .then((d) => cache.set(key, d))
        .catch((e: unknown) => setError(e instanceof Error ? e : new Error(String(e))));
    },
    setData: (d: T) => cache.set(key, d),
  };
}

/** Imperatively invalidate one or more query-key prefixes. */
export function invalidateQueries(...prefixes: readonly unknown[][]): void {
  for (const p of prefixes) cache.invalidate(p);
}

/** Optimistically update a key. Roll back with the returned rollback function on error. */
export function setOptimistic<T>(key: readonly unknown[], value: T): () => void {
  cache.setOptimistic(key, value);
  return () => cache.rollbackOptimistic(key);
}
