import { cn } from './cn';

export type Status =
  | 'pending'
  | 'completed'
  | 'cancelled'
  | 'paid'
  | 'unpaid'
  | 'booked'
  | 'submitted'
  | 'denied'
  | 'partially_paid';

export interface StatusChipProps {
  /** The status value that determines color and label. */
  status: Status;
  /** Extra classes merged onto the chip. */
  className?: string;
}

const STATUS_STYLES: Record<Status, { label: string; chip: string; dot: string }> = {
  pending: { label: 'Pending', chip: 'bg-amber-100 text-amber-800', dot: 'bg-amber-800' },
  completed: { label: 'Completed', chip: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-800' },
  paid: { label: 'Paid', chip: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-800' },
  cancelled: { label: 'Cancelled', chip: 'bg-rose-100 text-rose-800', dot: 'bg-rose-800' },
  unpaid: { label: 'Unpaid', chip: 'bg-rose-100 text-rose-800', dot: 'bg-rose-800' },
  denied: { label: 'Denied', chip: 'bg-rose-100 text-rose-800', dot: 'bg-rose-800' },
  booked: { label: 'Booked', chip: 'bg-blue-100 text-blue-800', dot: 'bg-blue-800' },
  submitted: { label: 'Submitted', chip: 'bg-blue-100 text-blue-800', dot: 'bg-blue-800' },
  partially_paid: { label: 'Partially Paid', chip: 'bg-amber-100 text-amber-800', dot: 'bg-amber-800' },
};

/**
 * A pill chip that visually communicates a domain status with a colored dot.
 *
 * @param status - One of the supported status values.
 * @param className - Additional classes to merge.
 * @example
 * <StatusChip status="partially_paid" />
 */
const StatusChip = ({ status, className }: StatusChipProps) => {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        s.chip,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} aria-hidden="true" />
      {s.label}
    </span>
  );
};

export default StatusChip;
