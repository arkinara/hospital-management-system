import { GripVertical, Settings, X, Lock } from 'lucide-react';
import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

const sizeColSpan: Record<NonNullable<WidgetTileProps['size']>, string> = {
  sm: 'col-span-1',
  md: 'col-span-1 md:col-span-1',
  lg: 'col-span-1 md:col-span-2',
};

/**
 * WidgetTile is the base container for a dashboard widget grid cell.
 *
 * @param id Stable identifier for the widget instance.
 * @param title Human readable widget title shown in the header.
 * @param icon Optional leading icon node rendered before the title.
 * @param size Grid footprint controlling the column span ('sm' | 'md' | 'lg').
 * @param locked When true the widget cannot be removed and shows a lock affordance.
 * @param onRemove Invoked when the user removes the widget (hidden while locked).
 * @param onConfigure Invoked when the user opens the widget configuration.
 * @param dragHandleProps Props spread onto the drag handle by the parent grid.
 * @param children Widget body content.
 */
export interface WidgetTileProps {
  id: string;
  title: string;
  icon?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  locked?: boolean;
  onRemove?: (id: string) => void;
  onConfigure?: (id: string) => void;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  children?: ReactNode;
}

const WidgetTile = ({
  id,
  title,
  icon,
  size = 'md',
  locked = false,
  onRemove,
  onConfigure,
  dragHandleProps,
  children,
}: WidgetTileProps) => {
  return (
    <section
      className={clsx(
        'bg-surface-container rounded-2xl p-5 border border-outline/10 shadow-sm',
        'transition-colors duration-200',
        sizeColSpan[size],
        locked && 'ring-1 ring-primary/30',
      )}
    >
      <header className="flex items-center gap-2 mb-4">
        <button
          type="button"
          aria-label="Drag widget"
          {...dragHandleProps}
          className={clsx(
            'flex items-center justify-center min-h-[44px] min-w-[44px] -ml-2 rounded-xl',
            'cursor-grab text-foreground/60 hover:bg-surface-container-high',
            'transition-colors duration-200',
          )}
        >
          <GripVertical size={20} strokeWidth={2} />
        </button>

        {icon && <span className="text-primary flex items-center">{icon}</span>}

        <h3 className="text-lg font-medium text-foreground truncate">{title}</h3>

        {locked && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-0.5 text-xs font-medium text-primary">
            <Lock size={12} strokeWidth={2} />
            Locked
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {onConfigure && (
            <button
              type="button"
              aria-label="Configure widget"
              onClick={() => onConfigure(id)}
              className={clsx(
                'flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl',
                'text-foreground/60 hover:bg-surface-container-high hover:text-foreground',
                'transition-colors duration-200',
              )}
            >
              <Settings size={18} strokeWidth={2} />
            </button>
          )}

          {locked ? (
            <span
              aria-hidden
              className="flex items-center justify-center min-h-[44px] min-w-[44px] text-primary/60"
            >
              <Lock size={18} strokeWidth={2} />
            </span>
          ) : (
            onRemove && (
              <button
                type="button"
                aria-label="Remove widget"
                onClick={() => onRemove(id)}
                className={clsx(
                  'flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl',
                  'text-foreground/60 hover:bg-rose-100 hover:text-rose-800',
                  'transition-colors duration-200',
                )}
              >
                <X size={18} strokeWidth={2} />
              </button>
            )
          )}
        </div>
      </header>

      <div className="text-foreground">{children}</div>
    </section>
  );
};

export default WidgetTile;
