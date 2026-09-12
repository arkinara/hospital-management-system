"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Field,
  ToastProvider,
  useToast,
} from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";
import { api } from "@/lib/api/client";
import { useQuery, queryKeys, invalidateQueries } from "@/lib/api/queryCache";
import { deptName, rp } from "@/lib/fixtures";
import type { Invoice, InvoiceLine, Patient } from "@/lib/fixtures";

interface LineDraft {
  key: number;
  code: string;
  desc: string;
  qty: string;
  unit: string;
}

export default function NewInvoicePage() {
  return (
    <ToastProvider renderIcon={renderIcon}>
      <NewInvoiceForm />
    </ToastProvider>
  );
}

function NewInvoiceForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [patientQ, setPatientQ] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [insurer, setInsurer] = useState("Self-pay");
  const [lines, setLines] = useState<LineDraft[]>([{ key: 1, code: "", desc: "", qty: "1", unit: "" }]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const patientSearch = useQuery<{ patients: Patient[] }>(
    queryKeys.patients({ q: patientQ, page: 1, page_size: 6 }),
    {
      fetcher: () =>
        api.get<{ patients: Patient[] }>("/patients", { query: { q: patientQ || undefined, page: 1, page_size: 6 } }),
    },
  );

  const total = lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.unit) || 0), 0);

  const updateLine = useCallback((key: number, patch: Partial<LineDraft>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }, []);

  const onSubmit = useCallback(async () => {
    if (!selectedPatient) {
      setFormError("Choose a patient for this invoice.");
      return;
    }
    const validLines = lines.filter((l) => l.desc.trim() && Number(l.unit) > 0);
    if (validLines.length === 0) {
      setFormError("Add at least one line item with a description and a unit amount.");
      return;
    }
    const lineItems: InvoiceLine[] = validLines.map((l) => ({
      code: l.code.trim() || `ITEM-${l.key}`,
      desc: l.desc.trim(),
      qty: Number(l.qty) || 1,
      unit: Number(l.unit),
      dept: selectedPatient.dept,
    }));
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await api.post<Invoice & { id: string }>("/invoices", {
        patient: selectedPatient.mrn,
        insurer,
        total: lineItems.reduce((s, l) => s + l.qty * l.unit, 0),
        lines: lineItems,
      });
      invalidateQueries(queryKeys.invoices() as unknown as unknown[]);
      toast({ tone: "success", message: `Invoice ${created.id} created`, detail: `${selectedPatient.name} · ${rp(created.total)}` });
      router.push(`/billing/invoices/${created.id}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not create the invoice.");
    } finally {
      setSubmitting(false);
    }
  }, [selectedPatient, insurer, lines, router, toast]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 lg:p-6" data-testid="new-invoice">
      <header>
        <h1 className="text-2xl font-semibold">New invoice</h1>
        <p className="mt-1 text-base text-muted">Create an invoice and its line items.</p>
      </header>

      {formError ? (
        <p role="alert" className="rounded-xl border border-danger/50 bg-danger-container p-3.5 text-base font-medium text-danger-container-foreground" data-testid="invoice-error">
          {formError}
        </p>
      ) : null}

      <div className="card space-y-5 !p-4">
        <section aria-label="Patient">
          <h2 className="mb-2 text-base font-semibold">Patient</h2>
          {selectedPatient ? (
            <div className="flex items-center gap-2 rounded-lg border border-outline bg-surface-1 p-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-container text-primary-container-foreground">
                {selectedPatient.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium">{selectedPatient.name}</p>
                <p className="num text-2xs text-muted">
                  {selectedPatient.mrn} · {deptName(selectedPatient.dept)} · {selectedPatient.insurer}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedPatient(null)}>
                Change
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Field
                id="invoice-patient-search"
                label="Search patient"
                type="search"
                icon="search"
                value={patientQ}
                onChange={setPatientQ}
                placeholder="Name or MRN…"
                renderIcon={renderIcon}
              />
              {patientQ && (patientSearch.data?.patients ?? []).length > 0 ? (
                <ul className="divide-y divide-outline overflow-hidden rounded-lg border border-outline">
                  {(patientSearch.data?.patients ?? []).slice(0, 6).map((p) => (
                    <li key={p.mrn}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPatient(p);
                          setPatientQ("");
                          setInsurer(p.insurer);
                        }}
                        className="press flex min-h-12 w-full items-center gap-2 px-3 text-left hover:bg-surface-2"
                      >
                        <span className="num font-semibold">{p.mrn}</span>
                        <span className="flex-1">{p.name}</span>
                        <span className="text-2xs text-muted">{p.insurer}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </section>

        <Field
          id="invoice-insurer"
          label="Payer"
          type="text"
          value={insurer}
          onChange={setInsurer}
          help="Who pays this invoice — insurer or self-pay."
          renderIcon={renderIcon}
        />

        <section aria-label="Line items">
          <h2 className="mb-2 text-base font-semibold">Line items</h2>
          <div className="space-y-3">
            {lines.map((l, index) => (
              <div key={l.key} className="grid gap-3 rounded-lg border border-outline bg-surface-1 p-3 sm:grid-cols-[8rem_1fr_4rem_7rem_2.5rem]">
                <Field
                  id={`line-${l.key}-code`}
                  label="Code"
                  type="text"
                  value={l.code}
                  onChange={(v) => updateLine(l.key, { code: v })}
                  optional
                  renderIcon={renderIcon}
                />
                <Field
                  id={`line-${l.key}-desc`}
                  label="Description"
                  type="text"
                  value={l.desc}
                  onChange={(v) => updateLine(l.key, { desc: v })}
                  renderIcon={renderIcon}
                />
                <Field
                  id={`line-${l.key}-qty`}
                  label="Qty"
                  type="number"
                  value={l.qty}
                  onChange={(v) => updateLine(l.key, { qty: v })}
                  mono
                  renderIcon={renderIcon}
                />
                <Field
                  id={`line-${l.key}-unit`}
                  label="Unit"
                  type="number"
                  value={l.unit}
                  onChange={(v) => updateLine(l.key, { unit: v })}
                  mono
                  renderIcon={renderIcon}
                />
                <div className="flex items-end justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    label={`Remove line ${index + 1}`}
                    icon={renderIcon("trash-2", "h-4 w-4")}
                    disabled={lines.length === 1}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  />
                </div>
              </div>
            ))}
          </div>
          <Button
            variant="subtle"
            icon={renderIcon("plus", "h-4 w-4")}
            onClick={() => setLines((ls) => [...ls, { key: Date.now(), code: "", desc: "", qty: "1", unit: "" }])}
          >
            Add line item
          </Button>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline pt-4">
          <span className="text-base text-muted">Total</span>
          <span className="num text-xl font-bold">{rp(total)}</span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => router.push("/billing")}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={renderIcon("check", "h-4 w-4")}
            loading={submitting}
            loadingLabel="Creating…"
            onClick={onSubmit}
            data-testid="create-invoice"
          >
            Create invoice
          </Button>
        </div>
      </div>
    </div>
  );
}