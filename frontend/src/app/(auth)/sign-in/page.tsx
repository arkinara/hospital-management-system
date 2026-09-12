"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ErrorSummary, Field } from "@/components/ui";
import { api, ApiError } from "@/lib/api/client";
import { setSession, getAccessToken } from "@/lib/auth/session";
import { renderIcon } from "@/lib/iconRenderer";
import type { AuthUser } from "@/lib/fixtures";

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AuthUser;
}

interface DemoAccount {
  role: string;
  email: string;
}

const DEMO_PASSWORD = "Hospital2025!";

const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: "Admin", email: "admin@hospital.test" },
  { role: "Doctor", email: "doctor@hospital.test" },
  { role: "Nurse", email: "nurse@hospital.test" },
  { role: "Receptionist", email: "receptionist@hospital.test" },
];

/** Staff registration is admin-only (#8); the link is dormant until an admin session exists. */
function isAdminSession(): boolean {
  return Boolean(getAccessToken()?.startsWith("mock_admin_"));
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetDone = searchParams.get("reset") === "success";
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [remember, setRemember] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email || !password) {
      setError("Enter your email and password to sign in.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<LoginResponse>("/auth/login", { email, password });
      setSession({ accessToken: res.access_token, refreshToken: res.refresh_token });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed. Please try again.");
      setSubmitting(false);
    }
  };

  const fillDemo = (account: DemoAccount) => {
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    setError(null);
  };

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold">Sign in</h1>
        <p className="mt-1.5 text-base text-muted">
          Use a demo account below, or enter your hospital credentials.
        </p>
      </header>

      {resetDone ? (
        <div
          role="status"
          className="mb-4 rounded-xl border border-success/40 bg-success-container p-3.5 text-base font-medium text-success-container-foreground"
          data-testid="reset-success-banner"
        >
          {renderIcon("check-circle-2", "mr-1.5 inline h-4 w-4 align-[-2px]")}
          Password updated. Sign in with your new password.
        </div>
      ) : null}

      <ErrorSummary
        errors={error ? [{ id: "password", label: error }] : []}
        renderIcon={renderIcon}
      />

      <form className="mt-5 grid gap-4" onSubmit={submit} noValidate>
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          placeholder="you@sirkaya.health"
          required
          renderIcon={renderIcon}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          required
          renderIcon={renderIcon}
        />
        <div className="flex items-center justify-between gap-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-base text-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.currentTarget.checked)}
              className="h-4 w-4 cursor-pointer accent-[rgb(var(--primary))]"
            />
            Keep me signed in
          </label>
          <Link
            href="/auth/forgot-password"
            className="font-medium text-primary underline underline-offset-2 hover:no-underline"
          >
            Forgot password?
          </Link>
        </div>
        <Button type="submit" variant="primary" size="lg" loading={submitting} loadingLabel="Signing in…">
          Sign in
        </Button>
      </form>

      {isAdminSession() ? (
        <p className="mt-5 text-center text-base">
          <Link
            href="/admin/users"
            className="font-medium text-primary underline underline-offset-2 hover:no-underline"
          >
            Register new staff
          </Link>
        </p>
      ) : null}

      <div className="mt-6 border-t border-outline pt-4">
        <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">
          Demo accounts
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <Button
              key={account.role}
              variant="subtle"
              size="sm"
              onClick={() => fillDemo(account)}
            >
              {account.role}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Password for every demo account: {DEMO_PASSWORD}</p>
      </div>
    </>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}