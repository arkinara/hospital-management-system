/**
 * MRN -> patient id resolution (#57.1).
 *
 * The backend addresses patients by integer `patient_id`; the frontend routes
 * and many calls still carry the human MRN. `GET /patients?query=<mrn>` matches
 * MRN (and name/national_id/phone), so resolve once and cache the result. The
 * cache is keyed by MRN and holds resolved values only — a failed lookup is
 * retried on the next call rather than poisoning the entry.
 */

import { api, ApiError } from "./client";
import type { BackendPatient } from "@/lib/fixtures";

function isNumeric(value: string | number | null | undefined): boolean {
  return (
    typeof value === "number" ||
    (typeof value === "string" && /^\d+$/.test(value.trim()))
  );
}

const resolved = new Map<string, number>();
const inflight = new Map<string, Promise<number>>();

export function isPatientId(ref: string | number | null | undefined): boolean {
  return isNumeric(ref);
}

export async function resolvePatientId(
  ref: string | number | null | undefined,
): Promise<number> {
  if (ref === null || ref === undefined || ref === "") {
    throw new ApiError("missing_identifier", "No patient identifier supplied.", 422);
  }
  if (isNumeric(ref)) return Number(ref);

  const key = String(ref).trim();
  const cached = resolved.get(key);
  if (cached !== undefined) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const res = await api.get<{ patients: BackendPatient[] }>("/patients", {
      query: { query: key, page: 1, page_size: 5 },
    });
    const patients = res?.patients ?? [];
    const match = patients.find((p) => p.mrn === key) ?? patients[0];
    if (!match || match.id === undefined || match.id === null) {
      throw new ApiError("not_found", `No patient found for ${key}.`, 404);
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

/** Test seam: drop cached resolutions between mock-db resets. */
export function clearPatientIdCache(): void {
  resolved.clear();
  inflight.clear();
}
