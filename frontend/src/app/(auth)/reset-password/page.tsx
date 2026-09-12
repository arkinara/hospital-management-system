"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ErrorSummary, Field } from "@/components/ui";
import { api, ApiError } from "@/lib/api/client";
import { renderIcon } from "@/lib/iconRenderer";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  if (!token) {
    return (
      <div
        role="alert"
        className="grid gap-4 text-center"
        data-testid="reset-invalid-token"
      >
        <div>
          <h1 className="font-display text-2xl font-semibold">Link invalid or expired</h1>
          <p className="mt-2 text-base leading-relaxed text-muted">
            This password-reset link is missing or no longer valid. Request a fresh link
            from the forgot-password screen.
          </p>
        </div>
        <Button variant="primary" size="lg" onClick={() => router.push("/auth/forgot-password")}>
          Request a new link
        </Button>
      </div>
    );
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password) {
      setError("Enter a new password.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match — retype both.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      router.push("/sign-in?reset=success");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 400
          ? "This reset link is invalid or has expired. Request a new one."
          : err instanceof Error
            ? err.message
            : "Could not reset the password. Please try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold">Choose a new password</h1>
        <p className="mt-1.5 text-base text-muted">
          Your reset link is valid. Pick a password you have not used here before.
        </p>
      </header>

      <form className="mt-5 grid gap-4" onSubmit={submit} noValidate>
        <ErrorSummary
          errors={error ? [{ id: "password", label: error }] : []}
          renderIcon={renderIcon}
        />
        <Field
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          help="At least 8 characters."
          required
          renderIcon={renderIcon}
        />
        <Field
          id="confirm"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          required
          renderIcon={renderIcon}
        />
        <Button type="submit" variant="primary" size="lg" loading={submitting} loadingLabel="Saving…">
          Save new password
        </Button>
      </form>

      <p className="mt-6 text-center text-base text-muted">
        <Link href="/sign-in" className="font-medium text-primary underline underline-offset-2 hover:no-underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}