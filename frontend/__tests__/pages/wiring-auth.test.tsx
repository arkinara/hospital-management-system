import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";
import { getAccessToken, getRefreshToken, setSession, clearSession } from "@/lib/auth/session";
import { api } from "@/lib/api/client";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(""),
}));

import SignInPage from "@/app/(auth)/sign-in/page";
import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(async () => {
  resetMockDb();
  resetMockConfig();
  queryCache.clear();
  push.mockClear();
  clearSession();
  server.resetHandlers();
  // Let the client's coalesced refresh-inflight promise settle between tests.
  await new Promise((r) => setTimeout(r, 80));
});

afterAll(() => server.close());

describe("Auth wiring (#25)", () => {
  it("stores the returned session and redirects on a live successful login", async () => {
    render(<SignInPage />);
    await screen.findByLabelText(/email/i);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "doctor@hospital.test" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "Hospital2025!" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(getAccessToken()).toMatch(/^mock_doctor_/);
    expect(getRefreshToken()).toMatch(/^mock_r_/);
  });

  it("shows the generic invalid-credentials message on a live 401", async () => {
    server.use(
      http.post("*/auth/login", () =>
        HttpResponse.json(
          { error: { code: "invalid_credentials", message: "Email or password is incorrect", trace_id: "t-401" } },
          { status: 401 },
        ),
      ),
    );
    render(<SignInPage />);
    await screen.findByLabelText(/email/i);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "nobody@test.test" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/email or password is incorrect/i);
    expect(push).not.toHaveBeenCalled();
  });

  it("returns the same confirmation regardless of account existence", async () => {
    render(<ForgotPasswordPage />);
    await screen.findByLabelText(/email/i);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "ghost@test.test" } });
    fireEvent.click(screen.getByRole("button", { name: /reset password|send reset/i }));
    expect(await screen.findByText(/if.*registered|reset link|sent/i)).toBeInTheDocument();
  });

  it("silently refreshes the session on a 401 and retries the original request", async () => {
    setSession({ accessToken: "stale_token", refreshToken: "refresh_token" });
    server.use(
      http.get("*/auth/me", ({ request }) => {
        const auth = request.headers.get("Authorization") ?? "";
        if (auth === "Bearer fresh_token") {
          return HttpResponse.json({
            id: 1,
            email: "doctor@hospital.test",
            full_name: "Dr. Sarah",
            role: "doctor",
            permissions: [],
          });
        }
        return HttpResponse.json(
          { error: { code: "invalid_token", message: "Token expired", trace_id: "t-401" } },
          { status: 401 },
        );
      }),
      http.post("*/auth/refresh", () =>
        HttpResponse.json({ access_token: "fresh_token", refresh_token: "new_refresh" }),
      ),
    );
    const session = await api.get<{ role: string }>("/auth/me");
    expect(session.role).toBe("doctor");
    expect(getAccessToken()).toBe("fresh_token");
    expect(getRefreshToken()).toBe("new_refresh");
  });

  it("clears the cached session when a refresh fails", async () => {
    setSession({ accessToken: "stale_token", refreshToken: "dead_refresh" });
    server.use(
      http.get("*/auth/me", () =>
        HttpResponse.json(
          { error: { code: "invalid_token", message: "Token expired", trace_id: "t-401" } },
          { status: 401 },
        ),
      ),
      http.post("*/auth/refresh", () =>
        HttpResponse.json(
          { error: { code: "invalid_refresh_token", message: "Refresh token invalid", trace_id: "t-401" } },
          { status: 401 },
        ),
      ),
    );
    await expect(api.get("/auth/me")).rejects.toThrow();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });
});