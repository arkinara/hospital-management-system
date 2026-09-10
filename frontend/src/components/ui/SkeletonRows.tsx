"use client";

import React from "react";

export interface SkeletonRowsProps {
  rows?: number;
  columns?: number;
}

/**
 * Loading placeholder shaped like the content it replaces, so the layout does not
 * jump when data arrives. The shimmer becomes a static block under
 * `prefers-reduced-motion` (handled in `src/styles/motion.css`, not here).
 */
export const SkeletonRows: React.FC<SkeletonRowsProps> = ({ rows = 6, columns = 5 }) => {
  const widths = [160, 90, 120, 70, 100];
  return (
    <div className="space-y-2 p-3" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3" style={{ height: "var(--row-h)" }}>
          <span className="skel h-8 w-8 shrink-0 rounded-full" />
          {Array.from({ length: columns }).map((__, c) => (
            <span
              key={c}
              className="skel h-3.5 flex-1"
              style={{ maxWidth: widths[c % widths.length] }}
            />
          ))}
        </div>
      ))}
    </div>
  );
};
