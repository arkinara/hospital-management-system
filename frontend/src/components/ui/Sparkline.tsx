"use client";

import React from "react";
import type { Tone } from "./tokens";

export interface SparklineProps {
  values: number[];
  tone?: Tone;
  width?: number;
  height?: number;
}

/** Resolves a tone to the CSS variable behind it, so a theme switch retints the mark. */
const strokeFor = (tone: Tone): string =>
  ({
    primary: "rgb(var(--primary))",
    success: "rgb(var(--success))",
    warning: "rgb(var(--warning))",
    danger: "rgb(var(--danger))",
    info: "rgb(var(--info))",
    neutral: "rgb(var(--fg-muted))",
  })[tone];

/**
 * Sparkline for a KPI tile.
 *
 * Deliberately `aria-hidden`: it shows shape, not value, and the tile it sits in
 * always states the number and the signed delta in text. A decorative mark that
 * announces itself is noise in a screen reader.
 *
 * Drawn as inline SVG against CSS variables — no charting runtime, and no re-render
 * needed when the theme changes.
 */
export const Sparkline: React.FC<SparklineProps> = ({
  values,
  tone = "primary",
  width = 132,
  height = 34,
}) => {
  const gradientId = React.useId();
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    height - 4 - ((v - min) / span) * (height - 10),
  ]);
  const line = points
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];
  const stroke = strokeFor(tone);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ height }}
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last[0].toFixed(1)} cy={last[1].toFixed(1)} r={2.4} fill={stroke} />
    </svg>
  );
};
