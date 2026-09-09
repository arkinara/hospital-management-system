import { cn } from './cn';

export interface SkeletonProps {
  /** Extra classes controlling the size/shape of the skeleton block. */
  className?: string;
}

/**
 * A base shimmer placeholder block.
 *
 * @param className - Size/shape classes.
 * @example
 * <Skeleton className="h-4 w-32" />
 */
export const Skeleton = ({ className }: SkeletonProps) => (
  <div className={cn('animate-pulse rounded bg-surface-container-highest', className)} />
);

export interface SkeletonTextProps {
  /** Number of text lines. */
  lines?: number;
  /** Extra classes on the wrapper. */
  className?: string;
}

/**
 * A stack of placeholder text lines.
 *
 * @param lines - How many lines to render (default 3).
 * @param className - Wrapper classes.
 * @example
 * <SkeletonText lines={2} />
 */
export const SkeletonText = ({ lines = 3, className }: SkeletonTextProps) => (
  <div className={cn('space-y-2', className)}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
    ))}
  </div>
);

/**
 * A placeholder list row: avatar circle plus two lines of text.
 *
 * @param className - Wrapper classes.
 * @example
 * <SkeletonRow />
 */
export const SkeletonRow = ({ className }: SkeletonProps) => (
  <div className={cn('flex items-center gap-3', className)}>
    <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
    <div className="flex-1 space-y-2">
      <Skeleton className="h-3.5 w-1/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  </div>
);

/**
 * A placeholder card with header line and body text.
 *
 * @param className - Root classes.
 * @example
 * <SkeletonCard />
 */
export const SkeletonCard = ({ className }: SkeletonProps) => (
  <div
    className={cn(
      'rounded-2xl border border-outline/10 bg-surface-container p-5',
      className,
    )}
  >
    <Skeleton className="mb-4 h-5 w-1/3" />
    <SkeletonText lines={3} />
  </div>
);

export default Skeleton;
