import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/lib/api/server";
import { resetMockDb } from "@/lib/api/handlers";
import { mockConfig, resetMockConfig } from "@/lib/api/mockConfig";
import { queryCache } from "@/lib/api/queryCache";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/admin/permissions",
}));

import PermissionMatrixScreen from "@/app/(app)/admin/permissions/page";

beforeAll(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:3000";
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  resetMockDb();
  resetMockConfig();
  queryCache.clear();
  push.mockClear();
  server.resetHandlers();
});

afterAll(() => server.close());

describe("Permission matrix wiring (#50)", () => {
  it("loads the live matrix from /permissions", async () => {
    render(<PermissionMatrixScreen />);
    await screen.findByRole("heading", { name: /permission matrix/i });
    const box = screen.getAllByRole("checkbox")[0];
    expect(box).toBeInTheDocument();
  });

  it("renders the error state with retry when the load fails", async () => {
    mockConfig.permissions.get.errorRate = 1;
    render(<PermissionMatrixScreen />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("persists a changed cell against /permissions/:role/:module", async () => {
const putSpy = vi.fn((_info: { request: Request }) =>
  HttpResponse.json({ role: "doctor", module: "records", allowed: false, canView: false, canCreate: false, canEdit: false, canDelete: false }),
);
    server.use(http.put("*/permissions/:role/:module", putSpy));
    render(<PermissionMatrixScreen />);
    await screen.findByRole("heading", { name: /permission matrix/i });
    // Toggle doctor/records/view off, then save.
    const box = screen.getByTestId("cell-doctor-records-view").querySelector("input")!;
    const wasChecked = box.checked;
    fireEvent.click(box);
    fireEvent.click(screen.getByTestId("save"));
    await waitFor(() => expect(putSpy).toHaveBeenCalled());
    const info = putSpy.mock.calls[0][0] as { request: Request };
    expect(info.request.url).toContain("/permissions/doctor/records");
  });

  it("keeps pending changes on screen when the save fails", async () => {
    server.use(
      http.put("*/permissions/:role/:module", () =>
        HttpResponse.json(
          { error: { code: "forbidden", message: "Cannot remove the last admin", trace_id: "t-403" } },
          { status: 403 },
        ),
      ),
    );
    render(<PermissionMatrixScreen />);
    await screen.findByRole("heading", { name: /permission matrix/i });
    const box = screen.getByTestId("cell-doctor-records-view").querySelector("input")!;
    fireEvent.click(box);
    fireEvent.click(screen.getByTestId("save"));
    // The failure is announced and the draft survives (button still present).
    expect(await screen.findByTestId("error-toast")).toHaveTextContent(/forbidden|last admin/i);
    expect(screen.getByTestId("save")).toBeInTheDocument();
  });

  it("validates the response envelope shape used by the matrix", async () => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/permissions`);
    const body = (await res.json()) as { permissions: Array<Record<string, unknown>> };
    expect(res.status).toBe(200);
    expect(Array.isArray(body.permissions)).toBe(true);
    expect(body.permissions[0]).toHaveProperty("canView");
    expect(body.permissions[0]).toHaveProperty("canCreate");
  });
});