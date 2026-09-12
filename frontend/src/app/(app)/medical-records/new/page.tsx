"use client";

import React, { Suspense, useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  SkeletonRows,
  StateRegion,
  ToastProvider,
  useToast,
  type DataState,
} from "@/components/ui";
import { renderIcon } from "@/lib/iconRenderer";
import { api, ApiError } from "@/lib/api/client";
import { useQuery, queryKeys, invalidateQueries } from "@/lib/api/queryCache";
import { byDoctor, deptName } from "@/lib/fixtures";
import type { ClinicalSummary, Patient, VisitNote } from "@/lib/fixtures";

interface PendingPrescription {
  medication: string;
  dosage: string;
  frequency: string;
  durationDays: string;
  notes: string;
}

interface NewVisitBody {
  patient_id: string;
  doctor: string;
  dept: string;
  chiefComplaint: string;
  diagnosis: string;
  clinicalNotes: string;
  [key: string]: unknown;
}

function RecordEntryScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get("patient_id") ?? "";
  const { toast } = useToast();

  const [chiefComplaint, setChiefComplaint] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [prescriptions, setPrescriptions] = useState<PendingPrescription[]>([]);
  const [rxOpen, setRxOpen] = useState(false);

  // Prescription sub-form
  const [medication, setMedication] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [rxNotes, setRxNotes] = useState("");
  const [rxError, setRxError] = useState<string | null>(null);
  const [overrideAllergy, setOverrideAllergy] = useState(false);

  const [submitting, setSubmitting] = useState<"draft" | "sign" | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [signPassword, setSignPassword] = useState("");
  const [signError, setSignError] = useState<string | null>(null);

  const patientQuery = useQuery<Patient>(queryKeys.patient(patientId), {
    fetcher: () => api.get<Patient>(`/patients/${patientId}`),
    enabled: Boolean(patientId),
  });
  const summaryQuery = useQuery<ClinicalSummary>(["patients", patientId, "clinical-summary"], {
    fetcher: () => api.get<ClinicalSummary>(`/patients/${patientId}/clinical-summary`),
    enabled: Boolean(patientId),
  });

  const patient = patientQuery.data;
  const severeAllergies = useMemo(
    () => (summaryQuery.data?.allergies ?? []).filter((a) => a.severity === "severe"),
    [summaryQuery.data],
  );
  const hasSevereAllergy = severeAllergies.length > 0;

  const missingPatient = !patientId;

  const state: DataState = missingPatient
    ? "empty"
    : patientQuery.error
      ? "error"
      : patientQuery.loading && !patient
        ? "loading"
        : patient
          ? "ready"
          : "loading";

  const validateVisit = (): string | null => {
    if (!diagnosis.trim()) return "Diagnosis is required before the visit can be saved.";
    if (chiefComplaint.trim().length < 3) return "Add a chief complaint — at least a few words.";
    return null;
  };

  const validateRx = (): string | null => {
    if (!medication.trim()) return "Medication name is required.";
    if (!dosage.trim()) return "Dosage is required, e.g. 10 mg.";
    if (!frequency.trim()) return "Frequency is required, e.g. 1×/day.";
    const days = Number(durationDays);
    if (!durationDays || !Number.isFinite(days) || days <= 0) {
      return "Duration must be a positive number of days.";
    }
    return null;
  };

  const addPrescription = () => {
    const err = validateRx();
    if (err) {
      setRxError(err);
      return;
    }
    if (hasSevereAllergy && !overrideAllergy) {
      setRxError("Confirm the allergy override above before adding this medication.");
      return;
    }
    setPrescriptions((list) => [
      ...list,
      { medication, dosage, frequency, durationDays, notes: rxNotes },
    ]);
    setMedication("");
    setDosage("");
    setFrequency("");
    setDurationDays("");
    setRxNotes("");
    setRxError(null);
    setRxOpen(false);
    setOverrideAllergy(false);
  };

  const buildVisitBody = useCallback(
    (): NewVisitBody => ({
      patient_id: patientId,
      doctor: patient?.doctor ?? "D02",
      dept: patient?.dept ?? "GEN",
      chiefComplaint,
      diagnosis,
      clinicalNotes,
    }),
    [patientId, patient, chiefComplaint, diagnosis, clinicalNotes],
  );

  const createVisitWithRx = useCallback(
    async (body: NewVisitBody): Promise<VisitNote> => {
      const visit = await api.post<VisitNote>("/medical-records/visits", body);
      for (const rx of prescriptions) {
        await api.post(`/medical-records/visits/${visit.id}/prescriptions`, {
          medication: rx.medication,
          dosage: rx.dosage,
          frequency: rx.frequency,
          durationDays: Number(rx.durationDays),
          notes: rx.notes || undefined,
        });
      }
      return visit;
    },
    [prescriptions],
  );

  const saveDraft = useCallback(async () => {
    const err = validateVisit();
    if (err) {
      toast({ tone: "danger", message: err });
      return;
    }
    setSubmitting("draft");
    try {
      const visit = await createVisitWithRx(buildVisitBody());
      invalidateQueries(queryKeys.patientTimeline(patientId) as unknown as unknown[]);
      toast({
        tone: "success",
        message: "Draft saved",
        detail: `${patient?.name ?? patientId} — visit ${visit.id}`,
      });
      router.push(`/patients/${patientId}`);
    } catch (e) {
      toast({ tone: "danger", message: "Could not save the draft", detail: e instanceof Error ? e.message : "Unknown error" });
      setSubmitting(null);
    }
  }, [buildVisitBody, createVisitWithRx, patientId, patient, router, toast]);

  const openSign = useCallback(() => {
    const err = validateVisit();
    if (err) {
      toast({ tone: "danger", message: err });
      return;
    }
    setSignPassword("");
    setSignError(null);
    setSignOpen(true);
  }, [validateVisit, toast]);

  const doSign = useCallback(async () => {
    if (!signPassword) {
      setSignError("Enter your password to confirm.");
      return;
    }
    setSubmitting("sign");
    setSignError(null);
    try {
      const visit = await createVisitWithRx(buildVisitBody());
      await api.post(`/medical-records/visits/${visit.id}/sign`, {
        password_confirmation: signPassword,
      });
      invalidateQueries(queryKeys.patientTimeline(patientId) as unknown as unknown[]);
      setSignOpen(false);
      toast({
        tone: "success",
        message: "Visit signed and locked. Edits are now disabled.",
        detail: `${patient?.name ?? patientId} · ${visit.id}`,
      });
      router.push(`/patients/${patientId}`);
    } catch (e) {
      setSubmitting(null);
      if (e instanceof ApiError && e.status === 401) {
        setSignError("Password confirmation failed — check your password.");
      } else if (e instanceof ApiError && e.status === 409) {
        setSignError("A contraindicated prescription blocks signing. Remove it or confirm the override.");
      } else {
        setSignError(e instanceof Error ? e.message : "Could not sign the visit.");
      }
    }
  }, [signPassword, buildVisitBody, createVisitWithRx, patientId, patient, router, toast]);

  if (missingPatient) {
    return (
      <div className="mx-auto max-w-3xl p-4 lg:p-6" data-testid="record-entry">
        <h1 className="sr-only">New visit note</h1>
        <div className="card">
          <EmptyState
            icon="file-x"
            title="No patient selected"
            body="Open the record-entry form from a patient's record so their context is pre-filled. Without a patient this form cannot be used."
            action={
              <Button variant="primary" onClick={() => router.push("/patients")}>
                Go to patients
              </Button>
            }
            renderIcon={renderIcon}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 lg:p-6" data-testid="record-entry">
      <StateRegion
        state={state}
        loading={<SkeletonRows rows={5} columns={3} />}
        empty={<div className="card" />}
        error={
          <div className="card">
            <ErrorState
              title="Could not load this patient"
              body={patientQuery.error?.message ?? `No patient record for ${patientId}.`}
              onRetry={patientQuery.refetch}
              renderIcon={renderIcon}
            />
          </div>
        }
        ready={
          patient ? (
            <>
              <header>
                <h1 className="text-2xl font-semibold">New visit note</h1>
                <p className="mt-1 text-base text-muted">
                  {patient.name} · <span className="num">{patient.mrn}</span> ·{" "}
                  {deptName(patient.dept)} · {byDoctor(patient.doctor).name}
                </p>
              </header>

              <div className="card space-y-5 !p-4">
                <Field
                  id="chief-complaint"
                  label="Chief complaint"
                  type="textarea"
                  rows={2}
                  value={chiefComplaint}
                  onChange={setChiefComplaint}
                  placeholder="e.g. Chest tightness for 40 minutes"
                  renderIcon={renderIcon}
                />
                <Field
                  id="diagnosis"
                  label="Diagnosis"
                  type="text"
                  value={diagnosis}
                  onChange={setDiagnosis}
                  placeholder="e.g. I25.10 — Atherosclerotic heart disease"
                  required
                  help="Include the ICD-10 code when you have one."
                  renderIcon={renderIcon}
                />
                <Field
                  id="clinical-notes"
                  label="Clinical notes"
                  type="textarea"
                  rows={5}
                  value={clinicalNotes}
                  onChange={setClinicalNotes}
                  placeholder="Examination findings, plan, follow-up…"
                  optional
                  renderIcon={renderIcon}
                />
              </div>

              {/* Prescriptions */}
              <section className="card !p-4" aria-label="Prescriptions">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold">Prescriptions</h2>
                    <p className="mt-0.5 text-xs text-muted">
                      {prescriptions.length === 0
                        ? "No prescriptions attached to this visit yet."
                        : `${prescriptions.length} prescription${prescriptions.length > 1 ? "s" : ""} attached.`}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={renderIcon(rxOpen ? "chevron-up" : "plus", "h-4 w-4")}
                    onClick={() => setRxOpen((o) => !o)}
                    aria-expanded={rxOpen}
                  >
                    {rxOpen ? "Hide prescription form" : "Add prescription"}
                  </Button>
                </div>

                {hasSevereAllergy ? (
                  <div
                    role="alert"
                    className="mt-3 flex flex-wrap items-start gap-2 rounded-xl border border-danger/50 bg-danger-container p-3.5 text-danger-container-foreground"
                    data-testid="allergy-banner"
                  >
                    {renderIcon("alert-triangle", "mt-0.5 h-4 w-4 shrink-0")}
                    <div className="min-w-0 flex-1 text-base">
                      <p className="font-semibold">Severe allergy contraindication</p>
                      <p className="mt-0.5">
                        {severeAllergies.map((a) => `${a.substance} (${a.severity})`).join(", ")} on
                        record for {patient.name}. Adding a prescription is locked until you
                        confirm you have reviewed the record.
                      </p>
                      <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={overrideAllergy}
                          onChange={(e) => setOverrideAllergy(e.currentTarget.checked)}
                          className="h-4 w-4 cursor-pointer accent-[rgb(var(--danger))]"
                        />
                        Override contraindication — I reviewed the allergy record and accept the risk
                      </label>
                    </div>
                  </div>
                ) : null}

                {rxOpen ? (
                  <div className="mt-4 space-y-4 rounded-xl border border-outline bg-surface-1 p-4" data-testid="rx-form">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        id="rx-medication"
                        label="Medication"
                        type="text"
                        value={medication}
                        onChange={setMedication}
                        placeholder="e.g. Amoxicillin 500 mg"
                        required
                        renderIcon={renderIcon}
                      />
                      <Field
                        id="rx-dosage"
                        label="Dosage"
                        type="text"
                        value={dosage}
                        onChange={setDosage}
                        placeholder="e.g. 500 mg"
                        required
                        renderIcon={renderIcon}
                      />
                      <Field
                        id="rx-frequency"
                        label="Frequency"
                        type="text"
                        value={frequency}
                        onChange={setFrequency}
                        placeholder="e.g. 3×/day"
                        required
                        renderIcon={renderIcon}
                      />
                      <Field
                        id="rx-duration"
                        label="Duration (days)"
                        type="number"
                        inputMode="numeric"
                        value={durationDays}
                        onChange={setDurationDays}
                        placeholder="e.g. 7"
                        required
                        renderIcon={renderIcon}
                      />
                    </div>
                    <Field
                      id="rx-notes"
                      label="Notes"
                      type="textarea"
                      rows={2}
                      value={rxNotes}
                      onChange={setRxNotes}
                      placeholder="e.g. Take with food"
                      optional
                      renderIcon={renderIcon}
                    />
                    {rxError ? (
                      <p role="alert" className="rounded-lg border border-danger/50 bg-danger-container p-2.5 text-base font-medium text-danger-container-foreground" data-testid="rx-error">
                        {rxError}
                      </p>
                    ) : null}
                    <div className="flex justify-end">
                      <Button
                        variant="primary"
                        icon={renderIcon("plus", "h-4 w-4")}
                        onClick={addPrescription}
                        disabled={hasSevereAllergy && !overrideAllergy}
                      >
                        Add prescription
                      </Button>
                    </div>
                  </div>
                ) : null}

                {prescriptions.length > 0 ? (
                  <ul className="mt-4 divide-y divide-outline rounded-lg border border-outline">
                    {prescriptions.map((rx, i) => (
                      <li key={`${rx.medication}-${i}`} className="flex items-start gap-3 p-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-warning-container text-warning-container-foreground">
                          {renderIcon("pill", "h-4 w-4")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-medium">{rx.medication}</p>
                          <p className="text-sm text-muted">
                            {rx.dosage} · {rx.frequency} · {rx.durationDays} days
                            {rx.notes ? ` — ${rx.notes}` : ""}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          label="Remove prescription"
                          icon={renderIcon("trash-2", "h-4 w-4")}
                          onClick={() => setPrescriptions((l) => l.filter((_, j) => j !== i))}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="outline"
                  icon={renderIcon("save", "h-4 w-4")}
                  loading={submitting === "draft"}
                  loadingLabel="Saving draft…"
                  onClick={saveDraft}
                  data-testid="save-draft"
                >
                  Save draft
                </Button>
                <Button
                  variant="primary"
                  icon={renderIcon("pen-line", "h-4 w-4")}
                  loading={submitting === "sign"}
                  loadingLabel="Signing…"
                  onClick={openSign}
                  data-testid="sign-lock"
                >
                  Sign &amp; lock
                </Button>
              </div>
            </>
          ) : null
        }
      />

      <Dialog
        open={signOpen}
        title="Sign and lock this visit"
        tone="info"
        size="sm"
        onClose={() => {
          if (submitting !== "sign") setSignOpen(false);
        }}
        renderIcon={renderIcon}
      >
        <div className="space-y-4" data-testid="sign-dialog">
          <p className="text-base leading-relaxed text-muted">
            Signing locks the visit note and its prescriptions — nobody can edit it afterwards.
            Confirm with your password.
          </p>
          <Field
            id="sign-password"
            label="Your password"
            type="password"
            autoComplete="current-password"
            value={signPassword}
            onChange={setSignPassword}
            required
            renderIcon={renderIcon}
          />
          {signError ? (
            <p role="alert" className="rounded-lg border border-danger/50 bg-danger-container p-2.5 text-base font-medium text-danger-container-foreground" data-testid="sign-error">
              {signError}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setSignOpen(false)} disabled={submitting === "sign"}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={renderIcon("check-check", "h-4 w-4")}
              loading={submitting === "sign"}
              loadingLabel="Signing…"
              onClick={doSign}
              data-testid="confirm-sign"
            >
              Confirm and sign
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export default function MedicalRecordEntryPage() {
  return (
    <Suspense>
      <ToastProvider renderIcon={renderIcon}>
        <RecordEntryScreen />
      </ToastProvider>
    </Suspense>
  );
}