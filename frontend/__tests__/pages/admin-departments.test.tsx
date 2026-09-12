import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { mockConfig, resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/admin/departments",
}));

import DepartmentsPage from "@/app/(app)/admin/departments/page";
import DepartmentDetailPage from "@/app/(app)/admin/departments/[id]/page";

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  resetMockDb();
  resetMockConfig();
  queryCache.clear();
  push.mockClear();
});

afterAll(() => server.close());

describe("DepartmentsPage (#9)", () => {
  it("lists departments with capacity and occupancy", async () => {
    render(<DepartmentsPage />);
    expect((await screen.findAllByText("General")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("GEN").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("meter").length).toBeGreaterThan(0);
  });

  it("opens the new-department modal", async () => {
    render(<DepartmentsPage />);
    await screen.findAllByText("General");
    fireEvent.click(screen.getByRole("button", { name: /new department/i }));
    expect(await screen.findByLabelText(/^name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^code/i)).toBeInTheDocument();
  });

  it("shows the empty state when there are no departments", async () => {
    mockConfig.admin.departments.emptyResult = true;
    render(<DepartmentsPage />);
    expect(await screen.findByText(/no departments yet/i)).toBeInTheDocument();
  });

  it("renders an error state when the department service fails", async () => {
    mockConfig.admin.departments.errorRate = 1;
    render(<DepartmentsPage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});

describe("DepartmentDetailPage (#9)", () => {
  it("renders capacity and staff assignment tabs", async () => {
    render(<DepartmentDetailPage params={{ id: "1" }} />);
    expect(await screen.findByText("General")).toBeInTheDocument();
    expect(screen.getByText(/occupied beds/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /staff assignments/i }));
    expect((await screen.findAllByText(/no staff assigned|Unassign/i)).length).toBeGreaterThan(0);
  });
});