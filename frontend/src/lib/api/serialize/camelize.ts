/**
 * Snake_case <-> camelCase helpers (#57).
 *
 * The backend serialises database rows (snake_case); the prototype fixtures and
 * several render props are camelCase. Rather than hand-mapping every field, the
 * per-domain serializers build on these two deep converters.
 */

type Plain = Record<string, unknown>;

function isPlainObject(value: unknown): value is Plain {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function camelizeKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function snakeizeKey(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** Recursively convert snake_case object keys to camelCase. */
export function camelize<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => camelize(v)) as T;
  if (isPlainObject(value)) {
    const out: Plain = {};
    for (const [key, val] of Object.entries(value)) out[camelizeKey(key)] = camelize(val);
    return out as T;
  }
  return value as T;
}

/** Recursively convert camelCase object keys to snake_case. */
export function snakeize<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => snakeize(v)) as T;
  if (isPlainObject(value)) {
    const out: Plain = {};
    for (const [key, val] of Object.entries(value)) out[snakeizeKey(key)] = snakeize(val);
    return out as T;
  }
  return value as T;
}
