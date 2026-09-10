import React from 'react';
import { cn } from './cn';
import { TONE_CONTAINER, type Tone } from './tokens';
import type { IconRenderer } from './StatusChip';

export type Acuity = 'critical' | 'urgent' | 'standard' | 'routine';

/**
 * Ordered triage scale.
 *
 * `rank` makes "most urgent first" a data fact rather than a hand-written sort
 * comparator repeated at each call site.
 */
export const ACUITY: Record<Acuity, { label: string; tone: Tone; icon: string; rank: number }> = {
  critical: { label: 'Critical', tone: 'danger', icon: 'siren', rank: 0 },
  urgent: { label: 'Urgent', tone: 'warning', icon: 'alert-triangle', rank: 1 },
  standard: { label: 'Standard', tone: 'info', icon: 'circle', rank: 2 },
  routine: { label: 'Routine', tone: 'neutral', icon: 'circle-dot', rank: 3 },
};

/** Comparator for tables and queues: critical first. */
export const byAcuity = (a: Acuity, b: Acuity): number => ACUITY[a].rank - ACUITY[b].rank;

export interface AcuityBadgeProps {
  acuity: Acuity;
  renderIcon: IconRenderer;
  className?: string;
}

/**
 * Triage acuity.
 *
 * Each step carries its own glyph as well as its own colour, so the scale stays
 * ordered when printed in greyscale or read by someone with deuteranopia.
 */
export const AcuityBadge: React.FC<AcuityBadgeProps> = ({ acuity, renderIcon, className }) => {
  const meta = ACUITY[acuity];
  return (
    <span
      title={`Acuity: ${meta.label}`}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        TONE_CONTAINER[meta.tone],
        className,
      )}
    >
      {renderIcon(meta.icon, 'w-3 h-3')}
      <span>{meta.label}</span>
    </span>
  );
};
