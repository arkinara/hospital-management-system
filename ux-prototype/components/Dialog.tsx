import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from './cn';

export interface DialogProps {
  /** Whether the dialog is visible. */
  open: boolean;
  /** Called when the dialog requests to close (ESC, backdrop, X). */
  onClose: () => void;
  /** Dialog title shown in the header. */
  title: string;
  /** Dialog body content. */
  children?: ReactNode;
  /** Optional footer slot, typically action buttons. */
  footer?: ReactNode;
  /** Additional classes merged onto the panel. */
  className?: string;
}

/**
 * A Material Design 3 modal dialog with backdrop, ESC and close affordances.
 *
 * @param open - Controls visibility.
 * @param onClose - Close request handler.
 * @param title - Header title.
 * @param children - Body content.
 * @param footer - Optional footer action slot.
 * @param className - Additional panel classes.
 * @example
 * <Dialog open={open} onClose={close} title="Discharge" footer={<Button>Confirm</Button>}>...</Dialog>
 */
const Dialog = ({ open, onClose, title, children, footer, className }: DialogProps) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 z-50 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative z-[51] w-full max-w-lg rounded-2xl bg-surface-container-high p-6 shadow-lg',
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground/70 transition-colors duration-200 hover:bg-surface-container-high"
          >
            <X size={24} strokeWidth={2} />
          </button>
        </div>
        <div className="text-sm text-foreground/80">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
};

export default Dialog;
