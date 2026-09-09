import { cn } from './cn';

export interface FilterChip {
  /** Underlying value. */
  value: string;
  /** Visible label. */
  label: string;
  /** Optional count badge. */
  count?: number;
}

export interface FilterProps {
  /** Available filter chips. */
  chips: FilterChip[];
  /** Currently selected chip values. */
  selected: string[];
  /** Called with a chip value when it is toggled. */
  onToggle: (value: string) => void;
  /** Additional root classes. */
  className?: string;
}

/**
 * A horizontally scrollable row of multi-select filter chips.
 *
 * @param chips - Chip definitions.
 * @param selected - Selected chip values.
 * @param onToggle - Toggle handler.
 * @param className - Additional root classes.
 * @example
 * <Filter chips={chips} selected={sel} onToggle={toggle} />
 */
const Filter = ({ chips, selected, onToggle, className }: FilterProps) => {
  return (
    <div className={cn('flex gap-2 overflow-x-auto pb-1', className)}>
      {chips.map((chip) => {
        const isSelected = selected.includes(chip.value);
        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onToggle(chip.value)}
            className={cn(
              'inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors duration-200',
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'border border-outline/10 bg-surface-container-high text-foreground/80 hover:bg-surface-container-highest',
            )}
          >
            {chip.label}
            {chip.count != null && (
              <span
                className={cn(
                  'inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-xs',
                  isSelected ? 'bg-primary-foreground/20' : 'bg-surface-container-highest',
                )}
              >
                {chip.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default Filter;
