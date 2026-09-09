import { Stethoscope, Pill, Receipt, Activity } from 'lucide-react';
import clsx from 'clsx';
import type { ComponentType } from 'react';

export type TimelineType = 'visit' | 'prescription' | 'billing' | 'vitals';

export interface TimelineEntryData {
  date: string;
  type: TimelineType;
  doctor?: string;
  department: string;
  summary: string;
  amount?: number;
}

interface TypeMeta {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  accent: string;
  dot: string;
}

const typeMeta: Record<TimelineType, TypeMeta> = {
  visit: { icon: Stethoscope, label: 'Visit', accent: 'text-blue-800 bg-blue-100', dot: 'bg-blue-800' },
  prescription: { icon: Pill, label: 'Prescription', accent: 'text-emerald-800 bg-emerald-100', dot: 'bg-emerald-800' },
  billing: { icon: Receipt, label: 'Billing', accent: 'text-amber-800 bg-amber-100', dot: 'bg-amber-800' },
  vitals: { icon: Activity, label: 'Vitals', accent: 'text-rose-800 bg-rose-100', dot: 'bg-rose-800' },
};

/**
 * TimelineEntry renders a single visit-record item on a patient history rail.
 *
 * @param entry The record to display (date, type, doctor, department, summary, amount).
 * @param isLast When true the connecting rail line below the dot is hidden.
 */
export interface TimelineEntryProps {
  entry: TimelineEntryData;
  isLast?: boolean;
}

const TimelineEntry = ({ entry, isLast = false }: TimelineEntryProps) => {
  const meta = typeMeta[entry.type];
  const Icon = meta.icon;
  const hasDepartment = Boolean(entry.department && entry.department.trim());

  return (
    <article className="flex gap-4">
      <div className="flex flex-col items-center pt-1 w-20 shrink-0">
        <span className="text-xs text-foreground/60 text-center leading-tight mb-2">{entry.date}</span>
        <span className={clsx('h-3 w-3 rounded-full ring-2 ring-background', meta.dot)} />
        {!isLast && <span className="w-px flex-1 bg-outline/20 mt-1" />}
      </div>

      <div className="flex-1 pb-6 min-w-0">
        <div className="bg-surface-container rounded-2xl p-4 border border-outline/10 shadow-sm transition-colors duration-200">
          <div className="flex items-center gap-2 mb-2">
            <span className={clsx('inline-flex items-center justify-center h-8 w-8 rounded-xl', meta.accent)}>
              <Icon size={16} strokeWidth={2} />
            </span>
            <h4 className="text-base font-medium text-foreground">{meta.label}</h4>
            {entry.amount !== undefined && (
              <span className="ml-auto text-sm font-medium text-foreground tabular-nums">
                Rp {entry.amount.toLocaleString('id-ID')}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-2 text-sm text-foreground/70">
            {entry.doctor && <span>{entry.doctor}</span>}
            <span
              className={clsx(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                hasDepartment
                  ? 'bg-surface-container-high text-foreground/80'
                  : 'bg-surface-container-low text-foreground/50 italic',
              )}
            >
              {hasDepartment ? entry.department : 'Unknown department'}
            </span>
          </div>

          <p className="text-sm text-foreground/80">{entry.summary}</p>
        </div>
      </div>
    </article>
  );
};

export default TimelineEntry;
