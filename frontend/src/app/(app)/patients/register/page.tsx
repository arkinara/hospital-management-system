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
import type { ApiDepartment, Patient } from "@/lib/fixtures";

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

  const depts = useQuery<{ departments: ApiDepartment[] }>(queryKeys.departments(), {
    fetcher: () => api.get<{ departments: ApiDepartment[] }>("/admin/departments"),
  });

  const onSubmit = useCallback(async () => {
    if (!form.name.trim() || !form.dept) {
      setFormError("Full name and department are required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await api.post<Patient>("/patients", {
        name: form.name.trim(),
        dob: form.dob,
        sex: form.sex as Patient["sex"],
        dept: form.dept,
        phone: form.phone || undefined,
        insurer: form.insurer,
      });
      invalidateQueries(queryKeys.patients() as unknown as unknown[]);
      toast({ tone: "success", message: `Patient ${created.name} registered`, detail: created.mrn });
      router.push(`/patients/${created.mrn}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not register the patient.");
    } finally {
      setSubmitting(false);
    }
  }, [form, router, toast]);

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
    </div>
  );
}