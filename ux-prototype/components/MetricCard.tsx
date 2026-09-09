import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { cn } from './cn';

export interface MetricTrend {
  /** Magnitude of the change, e.g. 12 for 12%. */
  value: number;
  /** Direction of the trend. */
  direction: 'up' | 'down';
}

export interface MetricCardProps {
  /** Descriptive label under the value. */
  label: string;
  /** Primary metric value. */
  value: string | number;
  /** Optional trend indicator. */
  trend?: MetricTrend;
  /** Optional leading icon. */
  icon?: LucideIcon;
  /** Additional root classes. */
  className?: string;
}

/**
 * A KPI metric card showing a value, label, optional icon and trend.
 *
 * @param label - Descriptive metric label.
 * @param value - The metric value.
 * @param trend - Optional up/down trend with magnitude.
 * @param icon - Optional leading icon.
 * @param className - Additional root classes.
 * @example
 * <MetricCard label="Admissions" value={128} trend={{ value: 8, direction: 'up' }} icon={Bed} />
 */
const MetricCard = ({ label, value, trend, icon: Icon, className }: MetricCardProps) => {
  return (
    <div
      className={cn('rounded-2xl border border-outline/10 bg-surface-container p-5', className)}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-foreground/70">{label}</p>
        {Icon && (
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-primary">
            <Icon size={20} strokeWidth={2} />
          </span>
        )}
      </div>
      <p className="text-3xl font-bold text-foreground">{value}</p>
      {trend && (
        <div
          className={cn(
            'mt-2 inline-flex items-center gap-1 text-sm font-medium',
            trend.direction === 'up' ? 'text-emerald-800' : 'text-rose-800',
          )}
        >
          {trend.direction === 'up' ? (
            <ArrowUpRight size={20} strokeWidth={2} />
          ) : (
            <ArrowDownRight size={20} strokeWidth={2} />
          )}
          {trend.value}%
        </div>
      )}
    </div>
  );
};

export default MetricCard;
