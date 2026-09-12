"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  SkeletonRows,
  StateRegion,
  StatusChip,
  type Column,
  type DataState,
} from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";
import { useQuery, queryKeys } from "@/lib/api/queryCache";
import { api } from "@/lib/api/client";
import { rp } from "@/lib/fixtures";
import { claimStatusMeta, invoiceStatusMeta } from "@/lib/statusHelpers";
import type { Claim, Invoice } from "@/lib/fixtures";

type TabId = "invoices" | "claims";

export default function BillingPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("invoices");

  const invoices = useQuery<{ invoices: Invoice[] }>(queryKeys.invoices(), {
    fetcher: () => api.get<{ invoices: Invoice[] }>("/invoices"),
  });
  const claims = useQuery<{ claims: Claim[] }>(queryKeys.claims(), {
    fetcher: () => api.get<{ claims: Claim[] }>("/claims"),
    enabled: tab === "claims",
  });

  const invoiceRows = useMemo(() => [...(invoices.data?.invoices ?? [])], [invoices.data]);

  const invoiceColumns: Column<Invoice>[] = [
    {
      key: "invoice_number",
      label: "Invoice",
      mono: true,
      cell: (i) => <span className="num font-semibold">{i.id}</span>,
    },
    {
      key: "patient",
      label: "Patient",
      cell: (i) => <span>{i.patient}</span>,
    },
    {
      key: "total",
      label: "Total",
      align: "right",
      mono: true,
      cell: (i) => <span className="num">{rp(i.total)}</span>,
    },
    {
      key: "status",
      label: "Status",
      width: "9rem",
      cell: (i) => {
        const meta = invoiceStatusMeta(i.status);
        return <StatusChip status={meta.status} label={meta.label} renderIcon={renderIcon} />;
      },
    },
    {
      key: "due_date",
      label: "Due",
      cell: (i) => <span className="num text-muted">{i.date}</span>,
    },
  ];

  const claimColumns: Column<Claim>[] = [
    { key: "id", label: "Claim", mono: true, cell: (c) => <span className="num font-semibold">{c.id}</span> },
    { key: "claimNumber", label: "Claim number", mono: true, cell: (c) => <span className="num">{c.claimNumber}</span> },
    { key: "invoiceId", label: "Invoice", mono: true, cell: (c) => <span className="num">{c.invoiceId}</span> },
    { key: "payerName", label: "Payer", cell: (c) => c.payerName },
    {
      key: "status",
      label: "Status",
      width: "9rem",
      cell: (c) => {
        const meta = claimStatusMeta(c.status);
        return <StatusChip status={meta.status} label={meta.label} renderIcon={renderIcon} />;
      },
    },
    {
      key: "submittedAt",
      label: "Submitted",
      cell: (c) => <span className="num text-muted">{c.submittedAt ? c.submittedAt.slice(0, 10) : "—"}</span>,
    },
  ];

  const invoiceState: DataState = invoices.error
    ? "error"
    : invoices.loading && !invoices.data
      ? "loading"
      : invoiceRows.length === 0
        ? "empty"
        : "ready";

  const claimState: DataState = claims.error
    ? "error"
    : claims.loading && !claims.data
      ? "loading"
      : (claims.data?.claims.length ?? 0) === 0
        ? "empty"
        : "ready";

  return (
    <div className="space-y-4 p-4 lg:p-6" data-testid="billing-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="mt-1 text-base text-muted">Invoices, claims and payment tracking.</p>
        </div>
        <Button
          variant="primary"
          icon={renderIcon("plus", "h-4 w-4")}
          onClick={() => router.push("/billing/invoices/new")}
          data-testid="new-invoice"
        >
          New invoice
        </Button>
      </header>

      <div
        className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-outline bg-surface-1 p-1"
        role="tablist"
        aria-label="Billing views"
      >
        {(
          [
            { id: "invoices", label: "Invoices", icon: "receipt-text" },
            { id: "claims", label: "Claims", icon: "shield-check" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`press inline-flex min-h-11 items-center gap-1.5 rounded-lg px-4 text-base font-medium ${
              tab === t.id ? "bg-primary text-primary-foreground" : "text-muted hover:bg-surface-3 hover:text-foreground"
            }`}
          >
            {renderIcon(t.icon, "h-4 w-4")}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "invoices" ? (
        <StateRegion
          state={invoiceState}
          loading={<SkeletonRows rows={6} columns={5} />}
          empty={
            <div className="card !p-0">
              <EmptyState
                icon="receipt-text"
                title="No invoices yet"
                body="Create the first invoice to start tracking revenue."
                action={
                  <Button variant="primary" onClick={() => router.push("/billing/invoices/new")}>
                    New invoice
                  </Button>
                }
                renderIcon={renderIcon}
              />
            </div>
          }
          error={
            <div className="card !p-0">
              <ErrorState
                title="Could not load invoices"
                body={invoices.error?.message ?? "The billing service did not respond."}
                onRetry={invoices.refetch}
                renderIcon={renderIcon}
              />
            </div>
          }
          ready={
            <div className="card overflow-hidden !p-0">
              <DataTable
                rows={invoiceRows}
                columns={invoiceColumns}
                rowKey={(i) => i.id}
                label="Invoices"
                caption="All invoices, newest first"
                rowLabel={(i) => `${i.id} — ${i.patient}`}
                onRowActivate={(i) => router.push(`/billing/invoices/${i.id}`)}
                renderIcon={renderIcon}
                mobileCard={(i) => (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num font-semibold">{i.id}</span>
                    <span className="flex-1 text-muted">{i.patient}</span>
                    <StatusChip status={invoiceStatusMeta(i.status).status} label={invoiceStatusMeta(i.status).label} renderIcon={renderIcon} />
                    <span className="num font-semibold">{rp(i.total)}</span>
                  </div>
                )}
              />
            </div>
          }
        />
      ) : (
        <StateRegion
          state={claimState}
          loading={<SkeletonRows rows={6} columns={5} />}
          empty={
            <div className="card !p-0">
              <EmptyState
                icon="shield-check"
                title="No insurance claims"
                body="Claims will appear once an invoice is submitted to a payer."
                renderIcon={renderIcon}
              />
            </div>
          }
          error={
            <div className="card !p-0">
              <ErrorState
                title="Could not load claims"
                body={claims.error?.message ?? "The claims service did not respond."}
                onRetry={claims.refetch}
                renderIcon={renderIcon}
              />
            </div>
          }
          ready={
            <div className="card overflow-hidden !p-0">
              <DataTable
                rows={claims.data?.claims ?? []}
                columns={claimColumns}
                rowKey={(c) => c.id}
                label="Claims"
                caption="Insurance claims across all invoices"
                rowLabel={(c) => `${c.id} — ${c.payerName}`}
                renderIcon={renderIcon}
              />
            </div>
          }
        />
      )}
    </div>
  );
}