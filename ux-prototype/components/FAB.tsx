import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

export interface FABProps {
  /** Label shown in the extended variant. */
  label: string;
  /** Lucide icon component. */
  icon: LucideIcon;
  /** Click handler. */
  onClick: () => void;
  /** 'extended' shows label + icon, 'regular' is icon-only. */
  variant?: 'extended' | 'regular';
  /** Additional classes merged onto the button. */
  className?: string;
}

/**
 * A Material Design 3 floating action button, extended or icon-only.
 *
 * @param label - Action label (also used as aria-label in regular variant).
 * @param icon - Leading icon.
 * @param onClick - Click handler.
 * @param variant - 'extended' (default) or 'regular'.
 * @param className - Additional classes.
 * @example
 * <FAB label="New Patient" icon={Plus} onClick={open} />
 */
const FAB = ({ label, icon: Icon, onClick, variant = 'extended', className }: FABProps) => {
  const regular = variant === 'regular';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={regular ? label : undefined}
      className={cn(
        'fixed bottom-6 right-6 z-30 flex h-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-colors duration-200 hover:bg-surface-container-high hover:text-foreground',
        regular ? 'w-14' : 'gap-2 px-5',
        className,
      )}
    >
      <Icon size={24} strokeWidth={2} />
      {!regular && <span className="text-sm font-medium">{label}</span>}
    </button>
  );
};

export default FAB;
