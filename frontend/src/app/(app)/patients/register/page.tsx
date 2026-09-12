"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  Field,
  ToastProvider,
  useToast,
} from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";
import { api } from "@/lib/api/client";
import { useQuery, queryKeys, invalidateQueries } from "@/lib/api/queryCache";
import type { ApiDepartment, Patient } from "@/lib/fixtures";

interface DedupSuspect {
  mrn: string;
  full_name: string;
  dob: string;
  national_id: string | null;
  match_type: string;
  similarity: number;
}

export default function RegisterPatientPage() {
  return (
    <ToastProvider renderIcon={renderIcon}>
      <RegisterPatientForm />
    </ToastProvider>
  );
}

function RegisterPatientForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "",
    dob: "1990-01-01",
    sex: "M",
    dept: "",
    phone: "",
    insurer: "Self-pay",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dedupOpen, setDedupOpen] = useState(false);
  const [dedupSuspects, setDedupSuspects] = useState<DedupSuspect[]>([]);

  const depts = useQuery<{ departments: ApiDepartment[] }>(queryKeys.departments(), {
    fetcher: () => api.get<{ departments: ApiDepartment[] }>("/admin/departments"),
  });

  const createPatient = useCallback(async () => {
    setSubmitting(true);
    try {
      const created = await api.post<Patient>("/patients", {
        name: form.name.trim(),
        dob: form.dob,
        sex: form.sex as Patient["sex"],
        dept: form.dept,
        phone: form.phone || undefined,
        insurer: form.insurer,
      });
      invalidateQueries(queryKeys.patients() as unknown as unknown[], ["patients", "search"]);
      toast({ tone: "success", message: `Patient ${created.name} registered`, detail: created.mrn });
      router.push(`/patients/${created.mrn}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not register the patient.");
    } finally {
      setSubmitting(false);
    }
  }, [form, router, toast]);

  const onSubmit = useCallback(async () => {
    if (!form.name.trim() || !form.dept) {
      setFormError("Full name and department are required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      // Live duplicate check before commit (#26): a name+dob match surfaces the
      // real record for review; the override flow persists the new record.
      const dedup = await api.post<{ suspects: DedupSuspect[] }>("/patients/dedup-check", {
        full_name: form.name.trim(),
        dob: form.dob,
      });
      if (dedup.suspects.length > 0) {
        setDedupSuspects(dedup.suspects);
        setDedupOpen(true);
        setSubmitting(false);
        return;
      }
      await createPatient();
    } catch (e) {
      setFormError(
        e instanceof Error
          ? e.message
          : "Duplicate check failed — the patient was not created.",
      );
      setSubmitting(false);
    }
  }, [form, createPatient]);

  const confirmOverride = useCallback(() => {
    setDedupOpen(false);
    setDedupSuspects([]);
    void createPatient();
  }, [createPatient]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 lg:p-6" data-testid="register-patient-page">
      <header>
        <h1 className="text-2xl font-semibold">Register patient</h1>
        <p className="mt-1 text-base text-muted">
          Create a new patient record at the front desk.
        </p>
      </header>

      {formError ? (
        <p role="alert" className="rounded-xl border border-danger/50 bg-danger-container p-3.5 text-base font-medium text-danger-container-foreground" data-testid="register-error">
          {formError}
        </p>
      ) : null}

      <div className="card space-y-5 !p-4">
        <Field
          id="rg-name"
          label="Full name"
          type="text"
          value={form.name}
          onChange={(v) => setForm((f) => ({ ...f, name: v }))}
          required
          renderIcon={renderIcon}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="rg-dob"
            label="Date of birth"
            type="date"
            value={form.dob}
            onChange={(v) => setForm((f) => ({ ...f, dob: v }))}
            renderIcon={renderIcon}
          />
          <Field
            id="rg-sex"
            label="Sex"
            type="select"
            options={[
              { label: "Male", value: "M" },
              { label: "Female", value: "F" },
            ]}
            value={form.sex}
            onChange={(v) => setForm((f) => ({ ...f, sex: v }))}
            renderIcon={renderIcon}
          />
        </div>
        <Field
          id="rg-dept"
          label="Department"
          type="select"
          options={[
            { label: "Choose a department…", value: "" },
            ...(depts.data?.departments ?? []).map((d) => ({ label: `${d.code} — ${d.name}`, value: d.code })),
          ]}
          value={form.dept}
          onChange={(v) => setForm((f) => ({ ...f, dept: v }))}
          required
          renderIcon={renderIcon}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="rg-phone"
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            optional
            renderIcon={renderIcon}
          />
          <Field
            id="rg-insurer"
            label="Insurer"
            type="text"
            value={form.insurer}
            onChange={(v) => setForm((f) => ({ ...f, insurer: v }))}
            renderIcon={renderIcon}
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => router.push("/patients")}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={renderIcon("user-plus", "h-4 w-4")}
            loading={submitting}
            loadingLabel="Registering…"
            onClick={onSubmit}
            data-testid="submit-registration"
          >
            Register patient
          </Button>
        </div>
      </div>

      <Dialog
        open={dedupOpen}
        title="Possible duplicate record"
        tone="warning"
        size="md"
        onClose={() => setDedupOpen(false)}
        renderIcon={renderIcon}
        actions={[
          {
            label: "Review record",
            variant: "ghost",
            icon: "user",
            onAction: () => {
              setDedupOpen(false);
              setDedupSuspects([]);
              router.push(`/patients/${dedupSuspects[0]?.mrn ?? ""}`);
            },
          },
          {
            label: "Register anyway",
            variant: "primary",
            icon: "user-plus",
            onAction: () => {
              confirmOverride();
            },
          },
        ]}
      >
        <p className="text-base leading-relaxed text-muted" data-testid="dedup-warning">
          The duplicate check found {dedupSuspects.length} record
          {dedupSuspects.length === 1 ? "" : "s"} that may already be this patient.
          Review the match before creating a new record.
        </p>
        <ul className="mt-3 divide-y divide-outline rounded-lg border border-outline">
          {dedupSuspects.map((s) => (
            <li key={s.mrn} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <span className="num font-semibold">{s.mrn}</span>
              <span className="min-w-0 flex-1 truncate">{s.full_name}</span>
              <span className="num text-2xs text-muted">{s.dob}</span>
              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-2xs font-semibold text-muted">
                {s.match_type.replace("_", " ")} · {Math.round(s.similarity * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}