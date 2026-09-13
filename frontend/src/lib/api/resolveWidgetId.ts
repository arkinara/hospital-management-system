/**
 * Widget key -> integer id resolution (#57.4).
 *
 * The backend addresses widget definitions by integer `id`; dashboard layout
 * writes carry `widget_id`. Several call sites only know the human `key`, so
 * resolve once against `GET /widget-config/widgets` and cache the result. The
 * cache holds resolved values only — a failed lookup is retried next call.
 */

import { api, ApiError } from "./client";
import type { BackendWidgetDefinition } from "@/lib/fixtures";

function isNumeric(value: string | number | null | undefined): boolean {
  return (
    typeof value === "number" ||
    (typeof value === "string" && /^\d+$/.test(value.trim()))
  );
}

const resolved = new Map<string, number>();
const inflight = new Map<string, Promise<number>>();

/** Test seam: drop cached resolutions between mock-db resets. */
export function clearWidgetIdCache(): void {
  resolved.clear();
  inflight.clear();
}

export async function resolveWidgetId(
  ref: string | number | null | undefined,
): Promise<number> {
  if (ref === null || ref === undefined || ref === "") {
    throw new ApiError("missing_identifier", "No widget identifier supplied.", 422);
  }
  if (isNumeric(ref)) return Number(ref);

  const key = String(ref).trim();
  const cached = resolved.get(key);
  if (cached !== undefined) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const res = await api.get<{ widgets: BackendWidgetDefinition[] }>("/widget-config/widgets");
    const widgets = res?.widgets ?? [];
    const match = widgets.find((w) => w.key === key);
    if (!match || match.id === undefined || match.id === null) {
      throw new ApiError("not_found", `No widget found for ${key}.`, 404);
    }
    resolved.set(key, match.id);
    return match.id;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}
