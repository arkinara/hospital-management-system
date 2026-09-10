import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import NotAuthorizedPage from "@/app/(app)/not-authorized/page";

describe("NotAuthorizedPage", () => {
  it("renders the denial message and a way back", () => {
    render(<NotAuthorizedPage />);
    expect(screen.getByText(/don't have access to this module/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /back to dashboard/i }));
    expect(push).toHaveBeenCalledWith("/dashboard");
  });
});
