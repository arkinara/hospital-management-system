"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorSummary, Field } from "@/components/ui";
import { api, ApiError } from "@/lib/api/client";
import { setSession } from "@/lib/auth/session";
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

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
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
        <Button type="submit" variant="primary" size="lg" loading={submitting} loadingLabel="Signing in…">
          Sign in
        </Button>
      </form>

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
