import { Stethoscope, Scissors, Pill, X } from 'lucide-react';
import clsx from 'clsx';
import type { ComponentType } from 'react';

export type InvoiceItemType = 'consultation' | 'procedure' | 'medication';

export interface InvoiceItem {
  description: string;
  itemType: InvoiceItemType;
  qty?: number;
  amount: number;
}

/**
 * Formats a number as Indonesian Rupiah using dot thousands separators.
 *
 * @param value Amount in whole Rupiah.
 * @returns A formatted string such as "Rp 350.000".
 */
export const formatIDR = (value: number): string =>
  `Rp ${Math.round(value).toLocaleString('id-ID')}`;

const typeMeta: Record<InvoiceItemType, { icon: ComponentType<{ size?: number; strokeWidth?: number }>; label: string; chip: string }> = {
  consultation: { icon: Stethoscope, label: 'Consultation', chip: 'bg-blue-100 text-blue-800' },
  procedure: { icon: Scissors, label: 'Procedure', chip: 'bg-amber-100 text-amber-800' },
  medication: { icon: Pill, label: 'Medication', chip: 'bg-emerald-100 text-emerald-800' },
};

/**
 * InvoiceLine renders a single billing line item row.
 *
 * @param item The billing item (description, type, quantity, amount).
 * @param editable When true a remove control is shown.
 * @param onRemove Invoked when the line is removed.
 */
export interface InvoiceLineProps {
  item: InvoiceItem;
  editable?: boolean;
  onRemove?: () => void;
}

const InvoiceLine = ({ item, editable = false, onRemove }: InvoiceLineProps) => {
  const meta = typeMeta[item.itemType];
  const Icon = meta.icon;
  const lineTotal = item.amount * (item.qty ?? 1);

  return (
    <div className="flex items-center justify-between py-3 border-b border-outline/10">
      <div className="flex items-center gap-3 min-w-0">
        <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-surface-container-high text-foreground/70 shrink-0">
          <Icon size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">{item.description}</span>
            <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', meta.chip)}>
              {meta.label}
            </span>
          </div>
          {item.qty !== undefined && item.qty > 1 && (
            <span className="text-xs text-foreground/60 tabular-nums">
              {item.qty} × {formatIDR(item.amount)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-sm font-medium text-foreground tabular-nums">{formatIDR(lineTotal)}</span>
        {editable && onRemove && (
          <button
            type="button"
            aria-label="Remove line item"
            onClick={onRemove}
            className={clsx(
              'flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl',
              'text-foreground/60 hover:bg-rose-100 hover:text-rose-800',
              'transition-colors duration-200',
            )}
          >
            <X size={18} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
};

export default InvoiceLine;
