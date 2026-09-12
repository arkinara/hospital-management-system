"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, ErrorState, SkeletonRows } from "@/components/ui";
import { CurrentUserProvider } from "@/lib/auth/currentUserContext";
import {
  SHELL_NAV,
  hasModuleAccess,
  moduleForPath,
  navKeyForPath,
  titleForPath,
} from "@/lib/auth/nav";
import { clearSession } from "@/lib/auth/session";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDensity } from "@/hooks/useDensity";
import { useTheme } from "@/hooks/useTheme";
import { renderIcon } from "@/lib/iconRenderer";
import GlobalCommandPalette, { useCommandPalette } from "@/components/GlobalCommandPalette";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, permissions, loading, error, switchRole } = useCurrentUser();
  const { isDark, toggleTheme } = useTheme();
  const { effectiveDensity, toggleDensity } = useDensity();
  const { open: openPalette } = useCommandPalette();

  const requiredModule = moduleForPath(pathname);
  const allowed = session ? hasModuleAccess(session.role, requiredModule, permissions) : false;

  React.useEffect(() => {
    if (session && !allowed) router.replace("/not-authorized");
  }, [session, allowed, router]);

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background p-6">
        <ErrorState
          title="Could not load your session"
          body={error}
          onRetry={() => window.location.reload()}
          renderIcon={renderIcon}
        />
      </div>
    );
  }

  if (loading || !session) {
    return (
      <div className="mx-auto min-h-dvh w-full max-w-6xl bg-background p-6">
        <SkeletonRows rows={4} columns={3} />
      </div>
    );
  }

  return (
    <CurrentUserProvider value={{ session, permissions, switchRole }}>
      <AppShell
        title={titleForPath(pathname)}
        subtitle={`Signed in as ${session.role}`}
        active={navKeyForPath(pathname)}
        nav={SHELL_NAV}
        session={session}
        permissions={permissions}
        density={effectiveDensity}
        isDark={isDark}
        onToggleDensity={toggleDensity}
        onToggleTheme={toggleTheme}
        onOpenPalette={openPalette}
        onSwitchRole={switchRole}
        onSignOut={() => {
          clearSession();
          router.push("/sign-in");
        }}
        renderIcon={renderIcon}
      >
        {allowed ? children : null}
        <GlobalCommandPalette />
      </AppShell>
    </CurrentUserProvider>
  );
}
