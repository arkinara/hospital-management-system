import { Lock, Unlock, Users, Info } from 'lucide-react';
import clsx from 'clsx';

export interface GovernedWidget {
  key: string;
  name: string;
  description: string;
  globallyEnabled: boolean;
  globallyLocked: boolean;
  defaultRole: string;
  adoptionCount?: number;
}

/**
 * WidgetLibraryCard is an admin governance card for a single dashboard widget,
 * controlling global availability and whether users may remove it.
 *
 * @param widget The governed widget definition and its current global state.
 * @param onToggleEnabled Invoked with the next enabled state.
 * @param onToggleLock Invoked with the next locked state (ignored while disabled).
 */
export interface WidgetLibraryCardProps {
  widget: GovernedWidget;
  onToggleEnabled?: (next: boolean) => void;
  onToggleLock?: (next: boolean) => void;
}

const WidgetLibraryCard = ({
  widget,
  onToggleEnabled,
  onToggleLock,
}: WidgetLibraryCardProps) => {
  const { name, description, globallyEnabled, globallyLocked, defaultRole, adoptionCount } = widget;
  // Locking only makes sense for an enabled widget; block it while disabled.
  const lockBlocked = !globallyEnabled;

  return (
    <article
      className={clsx(
        'bg-surface-container rounded-2xl p-5 border border-outline/10 shadow-sm',
        'transition-colors duration-200 flex flex-col gap-4',
        !globallyEnabled && 'opacity-60',
        globallyLocked && 'ring-1 ring-primary/30',
      )}
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-medium text-foreground">{name}</h3>
            {globallyLocked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                <Lock size={12} strokeWidth={2} />
                Locked
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-foreground/70">{description}</p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-surface-container-high px-2.5 py-0.5 text-xs font-medium text-foreground/80">
          Default role: {defaultRole}
        </span>
        {adoptionCount !== undefined && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2.5 py-0.5 text-xs font-medium text-foreground/80">
            <Users size={12} strokeWidth={2} />
            {adoptionCount} using
          </span>
        )}
      </div>

      {globallyLocked && (
        <p className="text-xs text-primary/80">Users cannot remove this widget.</p>
      )}

      <div className="mt-auto flex flex-col gap-3 border-t border-outline/10 pt-4">
        {/* Enable / disable switch */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-foreground">
            {globallyEnabled ? 'Enabled' : 'Disabled'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={globallyEnabled}
            aria-label="Toggle widget enabled"
            onClick={() => onToggleEnabled?.(!globallyEnabled)}
            className={clsx(
              'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full',
              'transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40',
              globallyEnabled ? 'bg-primary' : 'bg-surface-container-highest',
            )}
          >
            <span
              className={clsx(
                'inline-block h-5 w-5 rounded-full bg-background shadow transition-transform duration-200',
                globallyEnabled ? 'translate-x-5' : 'translate-x-1',
              )}
            />
          </button>
        </div>

        {/* Lock / unlock toggle */}
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
            {globallyLocked ? <Lock size={14} strokeWidth={2} /> : <Unlock size={14} strokeWidth={2} />}
            {globallyLocked ? 'Locked' : 'Unlocked'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={globallyLocked}
            aria-label="Toggle widget locked"
            disabled={lockBlocked}
            onClick={() => !lockBlocked && onToggleLock?.(!globallyLocked)}
            className={clsx(
              'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full',
              'transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40',
              globallyLocked ? 'bg-primary' : 'bg-surface-container-highest',
              lockBlocked && 'opacity-40 cursor-not-allowed',
            )}
          >
            <span
              className={clsx(
                'inline-block h-5 w-5 rounded-full bg-background shadow transition-transform duration-200',
                globallyLocked ? 'translate-x-5' : 'translate-x-1',
              )}
            />
          </button>
        </div>

        {lockBlocked && (
          <p className="inline-flex items-center gap-1.5 text-xs text-amber-800">
            <Info size={12} strokeWidth={2} />
            Enable the widget before locking it.
          </p>
        )}
      </div>
    </article>
  );
};

export default WidgetLibraryCard;
