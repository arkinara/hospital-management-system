"use client";

import React from "react";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";

const TITLES: Record<string, string> = {
  "patient-volume": "Patient volume",
  "appointment-no-show": "Appointment no-show rate",
  "revenue-by-department": "Revenue by department",
};

export default function ReportPlaceholderPage({ params }: { params: { slug: string } }) {
  const title = TITLES[params.slug] ?? "Report";
  return (
    <div className="space-y-4 p-4 lg:p-6" data-testid="report-placeholder">
      <header>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-base text-muted">Operational analytics.</p>
      </header>

      <div className="card !p-0">
        <EmptyState
          icon="bar-chart-3"
          title="Report coming in Phase 2"
          body={`${title} is on the analytics roadmap. The charts, filters and exports will land in the Phase 2 release.`}
          action={
            <Button variant="outline" onClick={() => window.history.back()}>
              Back to reports
            </Button>
          }
          secondary={
            <Link
              href="/admin/reports"
              className="press inline-flex min-h-11 items-center rounded-lg border border-outline bg-surface-0 px-3.5 font-medium text-foreground hover:bg-surface-2"
            >
              All reports
            </Link>
          }
          renderIcon={renderIcon}
        />
      </div>
    </div>
  );
}