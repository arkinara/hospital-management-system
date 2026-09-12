"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  SkeletonRows,
  StateRegion,
  StatusChip,
  ToastProvider,
  useToast,
  type DataState,
} from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";
import { api } from "@/lib/api/client";
import { useQuery, queryKeys, invalidateQueries, setOptimistic, queryCache } from "@/lib/api/queryCache";
import { rp } from "@/lib/fixtures";
import { claimStatusMeta, invoiceStatusMeta } from "@/lib/statusHelpers";
import type { Claim, Invoice, InvoiceLine, Payment } from "@/lib/fixtures";

interface InvoiceDetail {
  invoice: Invoice;
  line_items: InvoiceLine[];
  payments: Payment[];
  claims: Claim[];
}

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  return (
    <ToastProvider renderIcon={renderIcon}>
      <InvoiceDetailBody id={params.id} />
    </ToastProvider>
  );
}

function InvoiceDetailBody({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [payOpen, setPayOpen] = useState(false);

  const detail = useQuery<InvoiceDetail>(queryKeys.invoice(id), {
    fetcher: () => api.get<InvoiceDetail>(`/invoices/${id}`),
  });

  const invoice = detail.data?.invoice;

  const state: DataState = detail.error
    ? "error"
    : detail.loading && !detail.data
      ? "loading"
      : !invoice
        ? "empty"
        : "ready";

  const onPaymentRecorded = useCallback(() => {
    setPayOpen(false);
    invalidateQueries(
      queryKeys.invoices() as unknown as unknown[],
      queryKeys.invoice(id) as unknown as unknown[],
    );
    toast({ tone: "success", message: "Payment recorded", detail: `Payment added to ${id}` });
  }, [id, toast]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 lg:p-6" data-testid="invoice-detail">
      <StateRegion
        state={state}
        loading={<SkeletonRows rows={5} columns={4} />}
        empty={
          <EmptyState
            icon="receipt-text"
            title={`No invoice ${id}`}
            body="This invoice could not be found."
            renderIcon={renderIcon}
          />
        }
        error={
          <ErrorState
            title="Could not load invoice"
            body={detail.error?.message ?? "The billing service did not respond."}
            onRetry={detail.refetch}
            renderIcon={renderIcon}
          />
        }
        ready={
          invoice ? (
            <>
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="num text-2xl font-semibold">{invoice.id}</h1>
                    <StatusChip
                      status={invoiceStatusMeta(invoice.status).status}
                      label={invoiceStatusMeta(invoice.status).label}
                      renderIcon={renderIcon}
                    />
                  </div>
                  <p className="mt-1 text-base text-muted">
                    {invoice.patient} · {invoice.date} · {invoice.insurer}
                  </p>
                </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" icon={renderIcon("arrow-left", "h-4 w-4")} onClick={() => router.push("/billing")}>
                  Back to billing
                </Button>
                <Button
                  variant="primary"
                  icon={renderIcon("wallet", "h-4 w-4")}
                  onClick={() => setPayOpen(true)}
                  data-testid="record-payment"
                >
                  Record payment
                </Button>
              </div>
            </header>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="card !p-3.5">
                <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Total</p>
                <p className="num mt-1 text-xl font-bold">{rp(invoice.total)}</p>
              </div>
              <div className="card !p-3.5">
                <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Paid</p>
                <p className="num mt-1 text-xl font-bold text-success">{rp(invoice.paid)}</p>
              </div>
              <div className="card !p-3.5">
                <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Balance</p>
                <p className="num mt-1 text-xl font-bold text-danger">{rp(Math.max(0, invoice.total - invoice.paid))}</p>
              </div>
            </div>

            <section className="card !p-4" aria-label="Line items">
              <h2 className="mb-3 text-base font-semibold">Line items</h2>
              {detail.data?.line_items.length === 0 ? (
                <p className="text-base text-muted">No line items on this invoice.</p>
              ) : (
                <table className="dt">
                  <caption className="sr-only">Line items on invoice {invoice.id}</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="text-left">Code</th>
                      <th scope="col" className="text-left">Description</th>
                      <th scope="col" className="text-right">Qty</th>
                      <th scope="col" className="text-right">Unit</th>
                      <th scope="col" className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.data?.line_items.map((li, i) => (
                      <tr key={`${li.code}-${i}`}>
                        <td className="num">{li.code}</td>
                        <td>{li.desc}</td>
                        <td className="num text-right">{li.qty}</td>
                        <td className="num text-right">{rp(li.unit)}</td>
                        <td className="num text-right font-semibold">{rp(li.qty * li.unit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <div className="grid items-start gap-4 lg:grid-cols-2">
              <section className="card !p-4" aria-label="Payments">
                <h2 className="mb-3 text-base font-semibold">Payments</h2>
                {detail.data?.payments.length === 0 ? (
                  <EmptyState
                    icon="wallet"
                    title="No payments yet"
                    body="Record the first payment to bring this invoice down."
                    renderIcon={renderIcon}
                  />
                ) : (
                  <ul className="divide-y divide-outline">
                    {detail.data?.payments.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                        <span className="num font-medium">{rp(p.amount)}</span>
                        <span className="flex-1 capitalize text-muted">{p.method}</span>
                        <span className="num text-2xs text-subtle">{p.paidAt.slice(0, 10)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card !p-4" aria-label="Claims">
                <h2 className="mb-3 text-base font-semibold">Claims</h2>
                {detail.data?.claims.length === 0 ? (
                  <EmptyState
                    icon="shield-check"
                    title="No claim filed"
                    body="This invoice has no insurance claim yet."
                    renderIcon={renderIcon}
                  />
                ) : (
                  <ul className="divide-y divide-outline">
                    {detail.data?.claims.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                        <span className="num font-medium">{c.claimNumber}</span>
                        <span className="flex-1 truncate text-muted">{c.payerName}</span>
                        <StatusChip
                          status={claimStatusMeta(c.status).status}
                          label={claimStatusMeta(c.status).label}
                          size="sm"
                          renderIcon={renderIcon}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
            </>
          ) : null
        }
      />

      <PaymentDialog
        open={payOpen}
        invoiceId={id}
        current={invoice}
        onClose={() => setPayOpen(false)}
        onRecorded={onPaymentRecorded}
      />
    </div>
  );
}

function PaymentDialog({
  open,
  invoiceId,
  current,
  onClose,
  onRecorded,
}: {
  open: boolean;
  invoiceId: string;
  current?: Invoice;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = useCallback(async () => {
    const value = Number(amount);
    if (!value || value <= 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }
    if (current && value > Math.max(0, current.total - current.paid)) {
      setError("Payment exceeds the outstanding balance on this invoice.");
      return;
    }
    setSaving(true);
    setError(null);
    // Optimistic update: reflect the new paid/status before the server confirms,
    // roll back if the request fails.
    const cached = queryCache.get<InvoiceDetail>(queryKeys.invoice(invoiceId));
    const prevInvoice = cached?.invoice ?? current;
    const nextInvoice: Invoice | undefined = prevInvoice
      ? {
          ...prevInvoice,
          paid: prevInvoice.paid + value,
          status:
            prevInvoice.paid + value >= prevInvoice.total
              ? "paid"
              : prevInvoice.paid + value > 0
                ? "partially_paid"
                : "unpaid",
        }
      : undefined;
    const rollback =
      nextInvoice && cached
        ? setOptimistic(
            queryKeys.invoice(invoiceId) as unknown as unknown[],
            { ...cached, invoice: nextInvoice },
          )
        : undefined;
    try {
      await api.post(`/invoices/${invoiceId}/payments`, { amount: value, method });
      setAmount("");
      onRecorded();
    } catch (e) {
      rollback?.();
      setError(e instanceof Error ? e.message : "Could not record the payment.");
      setSaving(false);
    }
  }, [amount, invoiceId, method, current, onRecorded]);

  return (
    <Dialog
      open={open}
      title="Record payment"
      size="sm"
      onClose={onClose}
      renderIcon={renderIcon}
      actions={[
        { label: "Cancel", variant: "ghost" },
        {
          label: "Record payment",
          variant: "primary",
          icon: "wallet",
          onAction: () => {
            void submit();
            return false;
          },
        },
      ]}
    >
      <div className="space-y-4">
        <Field
          id="payment-amount"
          label="Amount"
          type="number"
          value={amount}
          onChange={setAmount}
          mono
          help="Amount in rupiah."
          renderIcon={renderIcon}
        />
        <Field
          id="payment-method"
          label="Method"
          type="select"
          options={[
            { label: "Cash", value: "cash" },
            { label: "Card", value: "card" },
            { label: "Bank transfer", value: "transfer" },
            { label: "Insurance", value: "insurance" },
          ]}
          value={method}
          onChange={setMethod}
          renderIcon={renderIcon}
        />
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        {saving ? (
          <p className="text-sm text-muted" role="status">
            Recording payment…
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}