/**
 * Typed API client (ticket #38).
 *
 * The single client components call. In development and test it resolves
 * through the MSW mock layer; in production it hits
 * `process.env.NEXT_PUBLIC_API_URL`. Every non-2xx response is thrown as a
 * typed `ApiError` carrying the backend's `{ error: { code, message,
 * trace_id } }` envelope, so screens render error states without sniffing
 * body types.
 */

import { clearSession, getAccessToken, getRefreshToken, setSession } from "@/lib/auth/session";
import { normaliseError, normaliseNetworkError, type NormalisedError } from "./errors";
import type { ApiErrorEnvelope } from "@/lib/fixtures";

export class ApiError extends Error {
  readonly code: string;
  readonly traceId: string;
  readonly status: number;
  readonly normalised: NormalisedError;

  constructor(code: string, message: string, status: number, traceId = "") {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.traceId = traceId;
    this.normalised = normaliseError(status, {
      error: { code, message, trace_id: traceId },
    });
  }
}

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface RequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface RequestBody {
  [key: string]: unknown;
}

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "";
}

function buildQuery(query: RequestOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: RequestBody,
  opts: RequestOptions = {},
  _retried = false,
): Promise<T> {
  const url = `${apiBase()}${path}${buildQuery(opts.query)}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders(),
    ...opts.headers,
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    const norm = normaliseNetworkError(err);
    throw new ApiError(norm.code, norm.message, 0, norm.traceId);
  }

  // Refresh-on-401: try once, then retry the original request.
  if (response.status === 401 && !_retried && path !== "/auth/login" && path !== "/auth/refresh") {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      const refreshed = await tryRefresh(refreshToken);
      if (refreshed) {
        return request<T>(method, path, body, opts, true);
      }
    }
    // No refresh token or refresh failed — clear session and fall through
    // to throw the 401 (caller decides what to do, usually redirect to sign-in).
    clearSession();
  }

  if (response.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const envelope = data as ApiErrorEnvelope | null;
    throw new ApiError(
      envelope?.error?.code ?? `http_${response.status}`,
      envelope?.error?.message ?? response.statusText,
      response.status,
      envelope?.error?.trace_id ?? "",
    );
  }

  return data as T;
}

let refreshInflight: Promise<boolean> | null = null;

async function tryRefresh(refreshToken: string): Promise<boolean> {
  // Coalesce concurrent refresh attempts into one.
  if (!refreshInflight) {
    refreshInflight = (async () => {
      try {
        const url = `${apiBase()}/auth/refresh`;
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!resp.ok) return false;
        const data = (await resp.json()) as {
          access_token: string;
          refresh_token?: string;
        };
        setSession({ accessToken: data.access_token, refreshToken: data.refresh_token });
        return true;
      } catch {
        return false;
      } finally {
        // Clear after a short delay so subsequent 401s can re-trigger
        setTimeout(() => { refreshInflight = null; }, 50);
      }
    })();
  }
  return refreshInflight;
}

export const api = {
  get<T>(path: string, opts?: RequestOptions): Promise<T> {
    return request<T>("GET", path, undefined, opts);
  },
  post<T>(path: string, body?: RequestBody, opts?: RequestOptions): Promise<T> {
    return request<T>("POST", path, body, opts);
  },
  patch<T>(path: string, body?: RequestBody, opts?: RequestOptions): Promise<T> {
    return request<T>("PATCH", path, body, opts);
  },
  put<T>(path: string, body?: RequestBody, opts?: RequestOptions): Promise<T> {
    return request<T>("PUT", path, body, opts);
  },
  delete<T>(path: string, opts?: RequestOptions): Promise<T> {
    return request<T>("DELETE", path, undefined, opts);
  },
};