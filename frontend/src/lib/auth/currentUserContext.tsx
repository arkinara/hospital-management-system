"use client";

import React from "react";
import type { PermissionMatrixData, Role } from "@/components/ui";
import type { CurrentUser } from "@/hooks/useCurrentUser";

export interface CurrentUserContextValue {
  session: CurrentUser;
  permissions: PermissionMatrixData;
  switchRole: (role: Role) => void;
}

const CurrentUserContext = React.createContext<CurrentUserContextValue | null>(null);

export const CurrentUserProvider = CurrentUserContext.Provider;

/** Read the signed-in user shared by the `(app)` shell. Layout-only. */
export function useCurrentSession(): CurrentUserContextValue {
  const value = React.useContext(CurrentUserContext);
  if (!value) {
    throw new Error("useCurrentSession must be used inside the (app) layout");
  }
  return value;
}
