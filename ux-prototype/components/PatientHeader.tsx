import { User, Phone, Pencil } from 'lucide-react';
import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface Patient {
  name: string;
  dob: string;
  mrn: string;
  departments: string[];
  avatarUrl?: string;
  phone?: string;
}

/**
 * Computes an age in whole years from an ISO date-of-birth string.
 *
 * @param dob ISO date string (YYYY-MM-DD).
 * @returns The age in years, or null when the date cannot be parsed.
 */
const calcAge = (dob: string): number | null => {
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age -= 1;
  return age;
};

/**
 * PatientHeader renders the identity banner for a patient record.
 *
 * @param patient Patient identity, contact and department assignments.
 * @param actions Optional action slot rendered on the right (e.g. Edit button).
 */
export interface PatientHeaderProps {
  patient: Patient;
  actions?: ReactNode;
}

const PatientHeader = ({ patient, actions }: PatientHeaderProps) => {
  const age = calcAge(patient.dob);

  return (
    <header className="bg-surface-container rounded-2xl p-5 border border-outline/10 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex items-center gap-4 min-w-0">
        {patient.avatarUrl ? (
          <img
            src={patient.avatarUrl}
            alt={patient.name}
            className="h-16 w-16 rounded-full ring-2 ring-background object-cover shrink-0"
          />
        ) : (
          <span className="h-16 w-16 rounded-full ring-2 ring-background bg-surface-container-high flex items-center justify-center text-foreground/60 shrink-0">
            <User size={28} strokeWidth={2} />
          </span>
        )}

        <div className="min-w-0">
          <h2 className="text-2xl font-semibold text-foreground truncate">{patient.name}</h2>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground/70">
            <span>
              {patient.dob}
              {age !== null && <span className="text-foreground/50"> ({age} yrs)</span>}
            </span>
            <span className="font-mono text-xs bg-surface-container-high rounded-full px-2 py-0.5 text-foreground/80">
              {patient.mrn}
            </span>
            {patient.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone size={14} strokeWidth={2} />
                {patient.phone}
              </span>
            )}
          </div>

          {patient.departments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {patient.departments.map((dept) => (
                <span
                  key={dept}
                  className={clsx(
                    'inline-flex items-center rounded-full bg-surface-container-high',
                    'px-2.5 py-0.5 text-xs font-medium text-foreground/80',
                  )}
                >
                  {dept}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="sm:ml-auto flex items-center gap-2">
        {actions ?? (
          <button
            type="button"
            className={clsx(
              'inline-flex items-center gap-2 rounded-full bg-primary px-4 min-h-[44px]',
              'text-primary-foreground text-sm font-medium',
              'transition-colors duration-200 hover:opacity-90',
            )}
          >
            <Pencil size={16} strokeWidth={2} />
            Edit
          </button>
        )}
      </div>
    </header>
  );
};

export default PatientHeader;
