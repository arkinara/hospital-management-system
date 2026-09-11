/**\n * Error normalisation helpers (ticket #39).
 *
 * Maps backend envelopes and HTTP statuses to a single `NormalisedError`
 * shape every component can render without sniffing response bodies.
 *
 * The backend wraps every failure in `{ error: { code, message, trace_id } }`
 * (see `backend/app/errors.py`). Field-level validation errors come back as
 * 422 with a structured `message` array from FastAPI's RequestValidationError.
 */

export type RecoveryAction =
  | { kind: "retry" }
  | { kind: "sign-in" }
  | { kind: "contact-support" }
  | { kind: "field"; field: string; message: string }
  | { kind: "none" };

export interface NormalisedError {
  /** Short user-facing title. */
  title: string;
  /** Longer message safe to show in a toast or alert. */
  message: string;
  /** Recovery action the UI should surface as a button. */
  recovery: RecoveryAction;
  /** Backend error code (e.g. "http_409", "allergy_contraindication"). */
  code: string;
  /** HTTP status. 0 if network/timeout. */
  status: number;
  /** trace_id from the backend; pass to support. */
  traceId: string;
  /** True for transient errors (timeout, 5xx, network). UI may auto-retry. */
  transient: boolean;
  /** Field-level errors keyed by field name. */
  fieldErrors: Record<string, string>;
}

const TITLE_BY_STATUS: Record<number, string> = {
  0: "Network error",
  400: "Bad request",
  401: "Sign-in required",
  403: "Not allowed",
  404: "Not found",
  409: "Conflict",
  413: "File too large",
  415: "Unsupported file type",
  422: "Validation error",
  429: "Too many requests",
  500: "Server error",
  502: "Server unavailable",
  503: "Server unavailable",
  504: "Server timeout",
};

function titleFor(status: number): string {
  return TITLE_BY_STATUS[status] ?? `Error (${status})`;
}

function defaultRecovery(status: number): RecoveryAction {
  if (status === 401) return { kind: "sign-in" };
  if (status === 0 || status === 429 || status === 502 || status === 503 || status === 504) {
    return { kind: "retry" };
  }
  if (status === 403) return { kind: "none" };
  if (status >= 500) return { kind: "contact-support" };
  return { kind: "none" };
}

function transientFor(status: number): boolean {
  return status === 0 || status === 429 || (status >= 500 && status < 600);
}

interface BackendErrorBody {
  error?: {
    code?: string;
    message?: string | Array<{ type?: string; loc?: (string | number)[]; msg?: string }>;
    trace_id?: string;
  };
}

/**
 * Parse a backend error envelope or FastAPI validation error into a
 * NormalisedError. Safe to call on any unknown body — falls back to generic.
 */
export function normaliseError(status: number, body: unknown): NormalisedError {
  const obj = (typeof body === "object" && body !== null ? body : {}) as BackendErrorBody;
  const err = obj.error ?? {};
  const code = err.code ?? `http_${status}`;
  const rawMessage = err.message;
  const traceId = err.trace_id ?? "";

  let message: string;
  if (typeof rawMessage === "string") {
    message = rawMessage;
  } else if (Array.isArray(rawMessage)) {
    message = rawMessage
      .map((m) => {
        const loc = Array.isArray(m.loc) ? m.loc.filter((l) => l !== "body").join(".") : "";
        return loc ? `${loc}: ${m.msg ?? m.type ?? "invalid"}` : (m.msg ?? m.type ?? "invalid");
      })
      .join("; ");
  } else {
    message = titleFor(status);
  }
  if (!message) message = titleFor(status);

  const fieldErrors: Record<string, string> = {};
  if (Array.isArray(rawMessage)) {
    for (const m of rawMessage) {
      if (Array.isArray(m.loc) && m.loc.length > 1 && typeof m.msg === "string") {
        const field = m.loc.filter((l) => l !== "body").join(".");
        if (field) fieldErrors[field] = m.msg;
      }
    }
  }
  const firstField = Object.keys(fieldErrors)[0];
  const recovery: RecoveryAction = firstField
    ? { kind: "field", field: firstField, message: fieldErrors[firstField] }
    : defaultRecovery(status);

  return {
    title: titleFor(status),
    message,
    recovery,
    code,
    status,
    traceId,
    transient: transientFor(status),
    fieldErrors,
  };
}

/**
 * Error thrown by the API client when fetch itself fails (network, timeout,
 * CORS, abort). Produces a NormalisedError with status 0.
 */
export function normaliseNetworkError(err: unknown): NormalisedError {
  const e = err as { name?: string; message?: string };
  const isAbort = e?.name === "AbortError";
  const title = isAbort ? "Request cancelled" : "Network error";
  const message = isAbort
    ? "The request was cancelled."
    : e?.message ?? "Could not reach the server.";
  return {
    title,
    message,
    recovery: { kind: "retry" },
    code: "network_error",
    status: 0,
    traceId: "",
    transient: true,
    fieldErrors: {},
  };
}