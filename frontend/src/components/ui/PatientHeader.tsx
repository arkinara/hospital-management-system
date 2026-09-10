"use client";

import React from "react";
import { cn } from "./cn";
import type { IconRenderer } from "./StatusChip";
import { AcuityBadge, type Acuity } from "./AcuityBadge";
import { StatusChip, type StatusKey } from "./StatusChip";

export interface Patient {
  mrn: string;
  name: string;
  dob: string;
  sex: "F" | "M";
  /** Masked in the header; the full value belongs on the Demographics tab. */
  nid: string;
  acuity: Acuity;
  status: StatusKey;
  allergies: string[];
  insurer: string;
  attending: string;
  department: string;
  /** Outstanding balance in IDR minor-free rupiah. */
  balance: number;
}

export interface PatientHeaderProps {
  patient: Patient;
  ageYears: number;
  /** Pre-formatted currency; formatting is the caller's locale decision. */
  formatCurrency: (n: number) => string;
  actions?: React.ReactNode;
  onOpenBilling?: () => void;
  renderIcon: IconRenderer;
  className?: string;
}

const initials = (name: string): string =>
  name
    .replace(/^Dr\.?\s*/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/**
 * Patient identity header.
 *
 * The allergy band is the reason this component exists as its own thing: a recorded
 * allergy is rendered as a full-width `role="alert"` strip above everything else, so
 * it can never end up one tab click away from a prescribing decision.
 *
 * Identity fields use tabular figures so an MRN read aloud from the screen matches
 * the one on the wristband, and the national ID is masked by default.
 */
export const PatientHeader: React.FC<PatientHeaderProps> = ({
  patient,
  ageYears,
  formatCurrency,
  actions,
  onOpenBilling,
  renderIcon,
  className,
}) => {
  const facts: [string, React.ReactNode][] = [
    ["MRN", <span key="mrn" className="num">{patient.mrn}</span>],
    [
      "Age / sex",
      <span key="age">
        <span className="num">{ageYears}y</span> · {patient.sex === "F" ? "Female" : "Male"}
      </span>,
    ],
    ["Date of birth", <span key="dob" className="num">{patient.dob}</span>],
    [
      "National ID",
      <span key="nid" className="num">{`${patient.nid.slice(0, 6)}••••${patient.nid.slice(-4)}`}</span>,
    ],
    ["Attending", patient.attending],
    ["Payer", patient.insurer],
  ];

  return (
    <section className={cn("card overflow-hidden !p-0", className)}>
      {patient.allergies.length ? (
        <div className="flex items-center gap-2 bg-danger px-4 py-2 text-surface-0" role="alert">
          {renderIcon("alert-triangle", "h-4 w-4 shrink-0")}
          <span className="text-base font-semibold">Allergies: {patient.allergies.join(" · ")}</span>
          <span className="hidden text-base opacity-90 sm:inline">— verify before prescribing</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-4 p-4">
        <span
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary-container text-lg font-semibold text-primary-container-foreground"
          aria-hidden
        >
          {initials(patient.name)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl font-semibold leading-tight">{patient.name}</h2>
            <AcuityBadge acuity={patient.acuity} renderIcon={renderIcon} />
            <StatusChip status={patient.status} renderIcon={renderIcon} />
          </div>

          <dl className="mt-2 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3 xl:grid-cols-6">
            {facts.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-2xs font-semibold uppercase tracking-wide text-subtle">{k}</dt>
                <dd className="truncate text-base">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {actions ? (
          <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto">{actions}</div>
        ) : null}
      </div>

      {patient.balance > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-outline bg-warning-container px-4 py-2.5 text-warning-container-foreground">
          {renderIcon("wallet", "h-4 w-4 shrink-0")}
          <span className="text-base font-medium">
            Outstanding balance{" "}
            <span className="num font-bold">{formatCurrency(patient.balance)}</span>
          </span>
          {onOpenBilling ? (
            <button
              type="button"
              onClick={onOpenBilling}
              className="press inline-flex h-9 items-center gap-1.5 rounded-lg border border-outline-strong px-2.5 text-base font-medium"
            >
              Open billing
              {renderIcon("arrow-right", "h-3.5 w-3.5")}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
