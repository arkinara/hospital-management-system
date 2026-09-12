import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import ReportsPage from "@/app/(app)/admin/reports/page";
import ReportPlaceholderPage from "@/app/(app)/admin/reports/[slug]/page";

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  resetMockDb();
  resetMockConfig();
  queryCache.clear();
});

afterAll(() => server.close());

describe("ReportsPage (#17)", () => {
  it("lists the three report cards", async () => {
    render(<ReportsPage />);
    expect(screen.getByText("Patient volume")).toBeInTheDocument();
    expect(screen.getByText("Appointment no-show rate")).toBeInTheDocument();
    expect(screen.getByText("Revenue by department")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});

describe("ReportPlaceholderPage (#17)", () => {
  it("shows the Phase 2 empty state for a report", async () => {
    render(<ReportPlaceholderPage params={{ slug: "patient-volume" }} />);
    expect(screen.getByText("Patient volume")).toBeInTheDocument();
    expect(screen.getByText(/report coming in phase 2/i)).toBeInTheDocument();
  });
});