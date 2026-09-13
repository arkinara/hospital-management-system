/**
 * Value coercion helpers shared by the per-domain serializers (#57).
 */

/**
 * Coerce a backend timestamp to an ISO string. The backend stores epoch
 * seconds (integers) while the fixtures use ISO strings — accept both.
 */
export function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string") {
    if (/^-?\d+$/.test(value)) {
      const n = Number(value);
      const ms = n > 1e12 ? n : n * 1000;
      return new Date(ms).toISOString();
    }
    return value;
  }
  return null;
}

/** ISO string -> `YYYY-MM-DD`, or "" when absent. */
export function toDateOnly(value: unknown): string {
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : "";
}

/** Epoch (s or ms) or ISO string -> epoch seconds; null when absent. */
export function toEpochSeconds(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return value > 1e12 ? Math.floor(value / 1000) : value;
  }
  if (typeof value === "string") {
    if (/^-?\d+$/.test(value)) {
      const n = Number(value);
      return n > 1e12 ? Math.floor(n / 1000) : n;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
  }
  return null;
}
