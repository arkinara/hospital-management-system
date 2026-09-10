"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { sessions } from "@/lib/fixtures";
import type { AuthSession } from "@/lib/fixtures";
import { PERMISSION_MATRIX } from "@/lib/auth/matrix";
import type { PermissionMatrixData, Role } from "@/components/ui/tokens";

/** Lowercase fixture role -> shell display role. */
const ROLE_FROM_PARAM: Record<string, Role> = {
  admin: "Admin",
  doctor: "Doctor",
  nurse: "Nurse",
  receptionist: "Receptionist",
};

const ROLE_TO_LOWER: Record<Role, string> = {
  Admin: "admin",
  Doctor: "doctor",
  Nurse: "nurse",
  Receptionist: "receptionist",
};

export interface CurrentUser {
  name: string;
  role: Role;
  dept: string;
}

export interface UseCurrentUserResult {
  session: CurrentUser | null;
  permissions: PermissionMatrixData;
  loading: boolean;
  error: string | null;
  switchRole: (role: Role) => void;
}

/** Read the prototype-testing `?role=` override from the current URL. */
function readRoleParam(): Role | null {
  if (typeof window === "undefined") return null;
  const role = new URLSearchParams(window.location.search).get("role");
  const display = role ? ROLE_FROM_PARAM[role.trim().toLowerCase()] : undefined;
  return display ?? null;
}

/** Build a preview session directly from the fixture profiles. */
function previewFromRole(role: Role): CurrentUser {
  const profile = sessions[role];
  return { name: profile.name, role, dept: profile.dept };
}

/** Build a session from the real `/auth/me` payload. */
function sessionFromAuth(auth: AuthSession): CurrentUser {
  const role = ROLE_FROM_PARAM[auth.role] ?? "Admin";
  return { name: auth.full_name || sessions[role].name, role, dept: sessions[role].dept };
}

/**
 * Current signed-in user (ticket #1).
 *
 * If a valid `?role=` query parameter is present it is honoured as a
 * prototype-testing override and returned immediately; otherwise the session
 * is fetched from `/auth/me`. The shell rebuilds its nav from the returned
 * role × module matrix either way, so switching roles re-renders the menu.
 */
export function useCurrentUser(): UseCurrentUserResult {
  const initial = readRoleParam();
  const [session, setSession] = useState<CurrentUser | null>(
    initial ? previewFromRole(initial) : null,
  );
  const [loading, setLoading] = useState<boolean>(initial === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (readRoleParam()) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<AuthSession>("/auth/me")
      .then((auth) => {
        if (cancelled) return;
        setSession(sessionFromAuth(auth));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load your session.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const switchRole = useCallback((role: Role) => {
    setSession(previewFromRole(role));
    setLoading(false);
    setError(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("role", ROLE_TO_LOWER[role]);
      window.history.replaceState({}, "", url);
    } catch {
      /* URL rewrite is an affordance; ignoring it still previews the role. */
    }
  }, []);

  return { session, permissions: PERMISSION_MATRIX, loading, error, switchRole };
}