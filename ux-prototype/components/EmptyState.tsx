import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

export interface EmptyStateProps {
  /** Visual/semantic variant. */
  variant?: 'informational' | 'action' | 'celebration';
  /** Lucide icon shown in the circle. */
  icon: LucideIcon;
  /** Primary heading. */
  heading: string;
  /** Supporting description. */
  description: string;
  /** Optional primary call to action. */
  cta?: { label: string; onClick: () => void };
  /** Additional root classes. */
  className?: string;
}

const ICON_TONE: Record<NonNullable<EmptyStateProps['variant']>, string> = {
  informational: 'text-foreground/70',
  action: 'text-primary',
  celebration: 'text-emerald-800',
};

/**
 * A centered empty-state block with icon, heading, description and optional CTA.
 *
 * @param variant - Visual tone (informational, action, celebration).
 * @param icon - Lucide icon rendered in the circle.
 * @param heading - Primary heading text.
 * @param description - Supporting copy.
 * @param cta - Optional primary action.
 * @param className - Additional root classes.
 * @example
 * <EmptyState variant="action" icon={Users} heading="No patients" description="Add one to begin." cta={{ label: 'Add', onClick: add }} />
 */
const EmptyState = ({
  variant = 'informational',
  icon: Icon,
  heading,
  description,
  cta,
  className,
}: EmptyStateProps) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-12 text-center',
        className,
      )}
    >
      <span
        className={cn(
          'mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-high',
          ICON_TONE[variant],
        )}
      >
        <Icon size={24} strokeWidth={2} />
      </span>
      <h3 className="text-lg font-medium text-foreground">{heading}</h3>
      <p className="mt-1 max-w-sm text-sm text-foreground/70">{description}</p>
      {cta && (
        <button
          type="button"
          onClick={cta.onClick}
          className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors duration-200 hover:bg-surface-container-high hover:text-foreground"
        >
          {cta.label}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
