"use client";

import { useCallback, useEffect, useState } from "react";
import type { Density } from "@/components/ui/tokens";

const KEY = "hms-density";
const COMPACT_MIN_WIDTH = 1024;

/**
 * In-memory fallback used when `localStorage` throws (private mode, disabled
 * storage, sandboxed iframe). The page still works for the session instead of
 * rendering unstyled.
 */
let memory: Density | null = null;

export const readDensity = (): Density => {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "compact" || v === "comfortable") return v;
  } catch {
    /* storage unavailable — fall through to memory */
  }
  return memory ?? "comfortable";
};

const writeDensity = (density: Density): void => {
  memory = density;
  try {
    window.localStorage.setItem(KEY, density);
  } catch {
    /* storage unavailable — session-only is fine */
  }
};

/** Compact is gated to >= 1024px so touch targets never drop below 44px. */
export const isCompactViewport = (): boolean =>
  typeof window === "undefined" ? true : window.innerWidth >= COMPACT_MIN_WIDTH;

export const applyDensity = (pref: Density): Density => {
  const effective: Density = pref === "compact" && isCompactViewport() ? "compact" : "comfortable";
  const root = document.documentElement;
  root.dataset.density = effective;
  root.classList.toggle("density-compact", effective === "compact");
  root.classList.toggle("density-comfortable", effective === "comfortable");
  return effective;
};

export interface UseDensityResult {
  /** The persisted preference. */
  density: Density;
  /** What is actually applied after the viewport gate. */
  effectiveDensity: Density;
  setDensity: (density: Density) => void;
  toggleDensity: () => void;
}

/**
 * Density preference, persisted to `localStorage.hms-density`.
 *
 * Reads degrade gracefully when storage is unavailable, and the effective density
 * falls back to `comfortable` below 1024px regardless of preference.
 */
export function useDensity(): UseDensityResult {
  const [density, setDensityState] = useState<Density>("comfortable");
  const [effectiveDensity, setEffective] = useState<Density>("comfortable");

  useEffect(() => {
    const pref = readDensity();
    setDensityState(pref);
    setEffective(applyDensity(pref));

    const onResize = () => setEffective(applyDensity(readDensity()));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const setDensity = useCallback((next: Density) => {
    writeDensity(next);
    setDensityState(next);
    setEffective(applyDensity(next));
  }, []);

  const toggleDensity = useCallback(() => {
    setDensity(readDensity() === "compact" ? "comfortable" : "compact");
  }, [setDensity]);

  return { density, effectiveDensity, setDensity, toggleDensity };
}
