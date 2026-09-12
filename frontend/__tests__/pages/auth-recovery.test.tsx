import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { mockConfig, resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";

const state = vi.hoisted(() => ({
  params: new URLSearchParams(""),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push }),
  usePathname: () => "/auth/forgot-password",
  useSearchParams: () => state.params,
}));

import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import ResetPasswordPage from "@/app/(auth)/reset-password/page";
import SignInPage from "@/app/(auth)/sign-in/page";

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  resetMockDb();
  resetMockConfig();
  queryCache.clear();
  state.push.mockClear();
  state.params = new URLSearchParams("");
  window.localStorage.clear();
});

afterAll(() => server.close());

describe("ForgotPasswordPage (#2)", () => {
  it("shows the generic confirmation after submitting an email", async () => {
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "doctor@hospital.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByTestId("forgot-sent")).toHaveTextContent(
      /if that email exists/i,
    );
  });

  it("does not leak whether the email is registered — same message for unknown addresses", async () => {
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "nobody@hospital.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByTestId("forgot-sent")).toHaveTextContent(
      /if that email exists/i,
    );
  });

  it("blocks an empty submission with an inline error", () => {
    render(<ForgotPasswordPage />);
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/enter the email address/i);
  });
});

describe("ResetPasswordPage (#2)", () => {
  it("shows a blocking error when no token is present", () => {
    render(<ResetPasswordPage />);
    expect(screen.getByTestId("reset-invalid-token")).toHaveTextContent(/invalid or expired/i);
  });

  it("resets the password and redirects to sign-in", async () => {
    state.params = new URLSearchParams("token=mock-reset-token-123");
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: "FreshPass123!" },
    });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: "FreshPass123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save new password/i }));

    await waitFor(() => expect(state.push).toHaveBeenCalledWith("/sign-in?reset=success"));
  });

  it("blocks mismatched passwords with an inline error", () => {
    state.params = new URLSearchParams("token=mock-reset-token-123");
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: "FreshPass123!" },
    });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: "Different456!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save new password/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/do not match/i);
    expect(state.push).not.toHaveBeenCalled();
  });
});

describe("SignInPage register/forgot links (#2)", () => {
  it("links to forgot-password from sign-in", () => {
    render(<SignInPage />);
    expect(screen.getByRole("link", { name: /forgot password/i })).toHaveAttribute(
      "href",
      "/auth/forgot-password",
    );
  });

  it("hides the register link by default (no admin session)", () => {
    render(<SignInPage />);
    expect(screen.queryByRole("link", { name: /register new staff/i })).not.toBeInTheDocument();
  });

  it("shows the register link when an admin session token is present", () => {
    window.localStorage.setItem("hospital.access_token", "mock_admin_abc");
    render(<SignInPage />);
    expect(screen.getByRole("link", { name: /register new staff/i })).toHaveAttribute(
      "href",
      "/admin/users",
    );
  });
});

describe("ForgotPasswordPage error state (#2)", () => {
  it("still shows the confirmation when the endpoint fails", async () => {
    mockConfig.auth.forgotPassword.errorRate = 1;
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "doctor@hospital.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByTestId("forgot-sent")).toHaveTextContent(
      /if that email exists/i,
    );
  });
});