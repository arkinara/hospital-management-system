import type { ReactNode } from 'react';
import { cn } from './cn';

export interface CardProps {
  /** Optional heading rendered in the card header row. */
  title?: ReactNode;
  /** Optional action slot rendered at the trailing edge of the header. */
  action?: ReactNode;
  /** Adds a subtle elevation shadow when true. */
  elevated?: boolean;
  /** Extra classes to merge onto the root element. */
  className?: string;
  /** Card body content. */
  children?: ReactNode;
}

/**
 * A Material Design 3 surface container card with optional header.
 *
 * @param title - Optional header heading.
 * @param action - Optional header trailing action slot.
 * @param elevated - Adds shadow-sm elevation.
 * @param className - Additional root classes.
 * @param children - Card body content.
 * @example
 * <Card title="Vitals" action={<Button>Edit</Button>} elevated>...</Card>
 */
const Card = ({ title, action, elevated = false, className, children }: CardProps) => {
  const hasHeader = title != null || action != null;
  return (
    <section
      className={cn(
        'rounded-2xl border border-outline/10 bg-surface-container p-5',
        elevated && 'shadow-sm',
        className,
      )}
    >
      {hasHeader && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title != null && (
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
          )}
          {action != null && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
};

export default Card;
