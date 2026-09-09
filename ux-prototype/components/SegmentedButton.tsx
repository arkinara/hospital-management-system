import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

export interface SegmentedOption<T extends string = string> {
  /** Underlying value emitted on selection. */
  value: T;
  /** Visible label. */
  label: string;
  /** Optional leading icon. */
  icon?: LucideIcon;
}

export interface SegmentedButtonProps<T extends string = string> {
  /** Selectable options. */
  options: SegmentedOption<T>[];
  /** Currently selected value. */
  value: T;
  /** Called with the newly selected value. */
  onChange: (value: T) => void;
  /** Extra classes merged onto the root. */
  className?: string;
}

/**
 * A Material Design 3 segmented button group of pill options.
 *
 * @param options - The available segments.
 * @param value - Currently selected value.
 * @param onChange - Selection change handler.
 * @param className - Additional root classes.
 * @example
 * <SegmentedButton options={[{value:'day',label:'Day'}]} value={v} onChange={setV} />
 */
const SegmentedButton = <T extends string = string>({
  options,
  value,
  onChange,
  className,
}: SegmentedButtonProps<T>) => {
  return (
    <div role="group" className={cn('flex flex-wrap gap-2', className)}>
      {options.map((opt) => {
        const selected = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors duration-200',
              selected
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface-container-high text-foreground/80 hover:bg-surface-container-highest',
            )}
          >
            {Icon && <Icon size={20} strokeWidth={2} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

export default SegmentedButton;
