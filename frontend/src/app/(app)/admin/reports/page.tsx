"use client";

import React from "react";
import Link from "next/link";
import { renderIcon } from "@/lib/iconRenderer";

interface ReportCard {
  slug: string;
  title: string;
  desc: string;
  icon: string;
}

const REPORTS: ReportCard[] = [
  {
    slug: "patient-volume",
    title: "Patient volume",
    desc: "Admissions and visits over time, by department and acuity.",
    icon: "bar-chart-3",
  },
  {
    slug: "appointment-no-show",
    title: "Appointment no-show rate",
    desc: "How often booked appointments are missed, with trends.",
    icon: "user-x",
  },
  {
    slug: "revenue-by-department",
    title: "Revenue by department",
    desc: "Billed and collected amounts per department, month over month.",
    icon: "trending-up",
  },
];

export default function ReportsPage() {
  return (
    <div className="space-y-4 p-4 lg:p-6" data-testid="reports-page">
      <header>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="mt-1 text-base text-muted">
          Operational analytics for the hospital — coming in Phase 2.
        </p>
      </header>

      <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r) => (
          <Link
            key={r.slug}
            href={`/admin/reports/${r.slug}`}
            className="card block !p-4 press hover:border-outline-strong"
            aria-label={`Open report: ${r.title}`}
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-outline bg-surface-2 text-muted">
              {renderIcon(r.icon, "h-5 w-5")}
            </span>
            <h2 className="mt-3 font-display text-lg font-semibold">{r.title}</h2>
            <p className="mt-1 text-base leading-relaxed text-muted">{r.desc}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-base font-medium text-primary">
              View report
              {renderIcon("arrow-right", "h-4 w-4")}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}