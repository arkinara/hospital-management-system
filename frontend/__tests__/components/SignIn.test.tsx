import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { resetMockConfig } from "@/lib/api/mockConfig";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/sign-in",
}));

import SignInPage from "@/app/(auth)/sign-in/page";

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  resetMockDb();
  resetMockConfig();
  push.mockClear();
  window.localStorage.clear();
});

afterAll(() => server.close());

describe("SignInPage", () => {
  it("renders email and password fields", () => {
    render(<SignInPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("fills credentials from a demo account button", () => {
    render(<SignInPage />);
    fireEvent.click(screen.getByRole("button", { name: "Admin" }));
    expect((screen.getByLabelText(/email/i) as HTMLInputElement).value).toBe(
      "admin@hospital.test",
    );
    expect((screen.getByLabelText(/^password/i) as HTMLInputElement).value).toBe("Hospital2025!");
  });

  it("logs in through the mock API and redirects to the dashboard", async () => {
    render(<SignInPage />);
    fireEvent.click(screen.getByRole("button", { name: "Doctor" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(window.localStorage.getItem("hospital.access_token")).toMatch(/^mock_doctor_/);
  });

  it("surfaces the error envelope on bad credentials", async () => {
    render(<SignInPage />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "admin@hospital.test" },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/email or password is incorrect/i);
    expect(push).not.toHaveBeenCalled();
  });
});
