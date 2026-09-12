"use client";

import React from "react";
import Link from "next/link";
import { Button, ErrorSummary, Field, ToastProvider, useToast } from "@/components/ui";
import { api } from "@/lib/api/client";
import { renderIcon } from "@/lib/iconRenderer";

function ForgotPasswordForm() {
  const { toast } = useToast();
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) {
      setError("Enter the email address you use to sign in.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/auth/forgot-password", { email: email.trim() });
      toast({ tone: "success", message: "Reset link sent", detail: "Check your inbox in a few minutes." });
    } catch (err) {
      // Deliberately identical outcome for a registered and unregistered
      // address — the account must never be enumerated through this form.
      toast({ tone: "info", message: "Request received" });
      void err;
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  };

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold">Reset your password</h1>
        <p className="mt-1.5 text-base text-muted">
          Enter the email address for your staff account and we will send a reset link.
        </p>
      </header>

      {sent ? (
        <div
          role="status"
          className="rounded-xl border border-outline bg-surface-1 p-4 text-base leading-relaxed text-muted"
          data-testid="forgot-sent"
        >
          {renderIcon("mail-check", "mr-1 inline h-4 w-4 align-[-2px] text-primary")}
          <span>
            If that email exists, we sent a reset link. If it does not arrive within a
            few minutes, check your spam folder — or try again in a moment.
          </span>
        </div>
      ) : (
        <form className="mt-5 grid gap-4" onSubmit={submit} noValidate>
          <ErrorSummary
            errors={error ? [{ id: "email", label: error }] : []}
            renderIcon={renderIcon}
          />
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
          <Button type="submit" variant="primary" size="lg" loading={submitting} loadingLabel="Sending link…">
            Send reset link
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-base text-muted">
        <Link href="/sign-in" className="font-medium text-primary underline underline-offset-2 hover:no-underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}

export default function ForgotPasswordPage() {
  return (
    <ToastProvider renderIcon={renderIcon}>
      <ForgotPasswordForm />
    </ToastProvider>
  );
}