/**
 * Minimal client-side session store (ticket #38).
 *
 * The real auth flow lands in the auth tickets; the API client only needs a
 * synchronous way to read the current access token so it can inject the
 * `Authorization` header. Browser-only; returns null during SSR.
 */

const TOKEN_KEY = "hospital.access_token";
const REFRESH_KEY = "hospital.refresh_token";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return storage()?.getItem(TOKEN_KEY) ?? null;
}

export function getRefreshToken(): string | null {
  return storage()?.getItem(REFRESH_KEY) ?? null;
}

export function setSession(tokens: { accessToken: string; refreshToken?: string | null }): void {
  const store = storage();
  if (!store) return;
  store.setItem(TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken) store.setItem(REFRESH_KEY, tokens.refreshToken);
}

export function clearSession(): void {
  const store = storage();
  if (!store) return;
  store.removeItem(TOKEN_KEY);
  store.removeItem(REFRESH_KEY);
}
