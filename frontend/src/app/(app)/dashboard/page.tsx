"use client";

import React from "react";
import { SkeletonRows } from "@/components/ui";
import { useCurrentSession } from "@/lib/auth/currentUserContext";
import type { Role } from "@/components/ui";

const GREETING: Record<Role, string> = {
  Admin: "Manage your hospital",
  Doctor: "Today's schedule + records",
  Nurse: "Your patients today",
  Receptionist: "Today's appointments",
};

interface WidgetStub {
  label: string;
  ticket: number;
  span?: string;
}

const WIDGETS: WidgetStub[] = [
  { label: "Patient census", ticket: 2 },
  { label: "Appointments today", ticket: 3 },
  { label: "Revenue collected", ticket: 4 },
  { label: "Pending records", ticket: 5 },
  { label: "Claim aging", ticket: 6 },
  { label: "Low-stock alerts", ticket: 7 },
];

export default function DashboardPage() {
  const { session } = useCurrentSession();

  return (
    <div className="mx-auto w-full max-w-7xl p-4 lg:p-6">
      <header className="mb-6">
        <h2 className="font-display text-2xl font-semibold">Welcome, {session.role}</h2>
        <p className="mt-1 text-base text-muted">{GREETING[session.role]}</p>
      </header>

      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        {WIDGETS.map((widget) => (
          <section
            key={widget.label}
            aria-label={widget.label}
            className="card flex flex-col overflow-hidden !p-0"
          >
            <header className="flex items-center justify-between gap-2 border-b border-outline bg-surface-1 px-3.5 py-2.5">
              <h3 className="truncate font-display text-base font-semibold">{widget.label}</h3>
              <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-2xs font-semibold text-muted">
                Ticket #{widget.ticket}
              </span>
            </header>
            <div className="min-w-0 flex-1 p-3.5">
              <SkeletonRows rows={3} columns={2} />
              <p className="mt-2 text-xs text-muted">
                Widget {widget.label} — coming in ticket #{widget.ticket}
              </p>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
