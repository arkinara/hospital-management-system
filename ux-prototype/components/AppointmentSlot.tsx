import { Clock, User, Stethoscope, Check, XCircle, LogIn } from 'lucide-react';
import clsx from 'clsx';

export type SlotStatus = 'open' | 'booked' | 'cancelled' | 'completed' | 'checked_in';

/**
 * AppointmentSlot renders a single calendar time slot in either a doctor-facing
 * or patient-facing variant.
 *
 * @param time Display label for the slot time (e.g. "09:30").
 * @param status Booking status driving the visual treatment.
 * @param variant 'doctor' shows the patient; 'patient' shows the doctor and department.
 * @param patient Patient name (shown in the doctor variant).
 * @param doctor Doctor name (shown in the patient variant).
 * @param department Department name (shown in the patient variant).
 * @param reason Optional reason for the appointment.
 * @param onClick Invoked when the slot is activated.
 */
export interface AppointmentSlotProps {
  time: string;
  status: SlotStatus;
  variant?: 'doctor' | 'patient';
  patient?: string;
  doctor?: string;
  department?: string;
  reason?: string;
  onClick?: () => void;
}

const statusStyles: Record<SlotStatus, string> = {
  open: 'border border-dashed border-outline/30 bg-transparent text-foreground/60',
  booked: 'bg-primary/10 border border-primary/30 text-foreground',
  cancelled: 'bg-rose-100 border border-rose-100 text-rose-800',
  completed: 'bg-emerald-100 border border-emerald-100 text-emerald-800',
  checked_in: 'bg-blue-100 border border-blue-100 text-blue-800',
};

const statusLabel: Record<SlotStatus, string> = {
  open: 'Available',
  booked: 'Booked',
  cancelled: 'Cancelled',
  completed: 'Completed',
  checked_in: 'Checked in',
};

const statusIcon: Record<SlotStatus, typeof Clock> = {
  open: Clock,
  booked: User,
  cancelled: XCircle,
  completed: Check,
  checked_in: LogIn,
};

const AppointmentSlot = ({
  time,
  status,
  variant = 'doctor',
  patient,
  doctor,
  department,
  reason,
  onClick,
}: AppointmentSlotProps) => {
  const StatusIcon = statusIcon[status];
  const isOpen = status === 'open';
  const isCancelled = status === 'cancelled';

  const primaryText =
    variant === 'doctor' ? patient : doctor;

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'w-full min-h-[44px] rounded-xl px-3 py-2 text-left flex items-center gap-3',
        'transition-colors duration-200 hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-primary/40',
        statusStyles[status],
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium tabular-nums shrink-0">
        <StatusIcon size={16} strokeWidth={2} />
        {time}
      </span>

      <span className="flex-1 min-w-0">
        {isOpen ? (
          <span className="text-sm">Available</span>
        ) : (
          <span className="flex flex-col min-w-0">
            <span
              className={clsx(
                'text-sm font-medium truncate',
                isCancelled && 'line-through',
              )}
            >
              {primaryText ?? statusLabel[status]}
            </span>
            {variant === 'patient' && department && (
              <span className="text-xs opacity-80 truncate inline-flex items-center gap-1">
                <Stethoscope size={12} strokeWidth={2} />
                {department}
              </span>
            )}
            {reason && (
              <span className={clsx('text-xs opacity-70 truncate', isCancelled && 'line-through')}>
                {reason}
              </span>
            )}
          </span>
        )}
      </span>

      {!isOpen && (
        <span className="text-xs font-medium opacity-80 shrink-0">{statusLabel[status]}</span>
      )}
    </button>
  );
};

export default AppointmentSlot;
