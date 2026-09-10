import React from 'react';
import { cn } from './cn';
import type { IconRenderer } from './StatusChip';
import { AcuityBadge, type Acuity } from './AcuityBadge';
import { StatusChip, type StatusKey } from './StatusChip';

export interface Patient {
  mrn: string;
  name: string;
  dob: string;
  sex: 'F' | 'M';
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
    .replace(/^Dr\.?\s*/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
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
    ['MRN', <span className="num">{patient.mrn}</span>],
    ['Age / sex', <><span className="num">{ageYears}y</span> · {patient.sex === 'F' ? 'Female' : 'Male'}</>],
    ['Date of birth', <span className="num">{patient.dob}</span>],
    ['National ID', <span className="num">{`${patient.nid.slice(0, 6)}••••${patient.nid.slice(-4)}`}</span>],
    ['Attending', patient.attending],
    ['Payer', patient.insurer],
  ];

  return (
    <section className={cn('card !p-0 overflow-hidden', className)}>
      {patient.allergies.length ? (
        <div className="flex items-center gap-2 px-4 py-2 bg-danger text-surface-0" role="alert">
          {renderIcon('alert-triangle', 'w-4 h-4 shrink-0')}
          <span className="text-base font-semibold">Allergies: {patient.allergies.join(' · ')}</span>
          <span className="text-base opacity-90 hidden sm:inline">— verify before prescribing</span>
        </div>
      ) : null}

      <div className="p-4 flex flex-wrap items-start gap-4">
        <span
          className="w-14 h-14 shrink-0 rounded-full bg-primary-container text-primary-container-foreground grid place-items-center font-semibold text-lg"
          aria-hidden
        >
          {initials(patient.name)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold font-display leading-tight">{patient.name}</h2>
            <AcuityBadge acuity={patient.acuity} renderIcon={renderIcon} />
            <StatusChip status={patient.status} renderIcon={renderIcon} />
          </div>

          <dl className="mt-2 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-x-5 gap-y-2">
            {facts.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-2xs uppercase tracking-wide text-subtle font-semibold">{k}</dt>
                <dd className="text-base truncate">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">{actions}</div> : null}
      </div>

      {patient.balance > 0 ? (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-t border-outline bg-warning-container text-warning-container-foreground">
          {renderIcon('wallet', 'w-4 h-4 shrink-0')}
          <span className="text-base font-medium">
            Outstanding balance <span className="num font-bold">{formatCurrency(patient.balance)}</span>
          </span>
          {onOpenBilling ? (
            <button
              type="button"
              onClick={onOpenBilling}
              className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg border border-outline-strong text-base font-medium press"
            >
              Open billing
              {renderIcon('arrow-right', 'w-3.5 h-3.5')}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
