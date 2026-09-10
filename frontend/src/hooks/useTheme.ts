"use client";

import { useCallback, useEffect, useState } from "react";
import type { ThemePref } from "@/components/ui/tokens";

const KEY = "hms-theme";

/** In-memory fallback when `localStorage` is unavailable. */
let memory: ThemePref | null = null;

const systemPrefersDark = (): boolean => {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
};

export const readThemePref = (): ThemePref => {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage unavailable — fall through to memory */
  }
  return memory ?? "system";
};

const writeThemePref = (pref: ThemePref): void => {
  memory = pref;
  try {
    window.localStorage.setItem(KEY, pref);
  } catch {
    /* storage unavailable — session-only is fine */
  }
};

export const resolveTheme = (pref: ThemePref): "light" | "dark" =>
  pref === "system" ? (systemPrefersDark() ? "dark" : "light") : pref;

export const applyTheme = (pref: ThemePref): "light" | "dark" => {
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.themePref = pref;
  return resolved;
};

export interface UseThemeResult {
  /** The persisted preference: light, dark or system. */
  theme: ThemePref;
  /** The palette currently applied. */
  isDark: boolean;
  setTheme: (pref: ThemePref) => void;
  toggleTheme: () => void;
}

/**
 * Theme preference, persisted to `localStorage.hms-theme`.
 *
 * `system` follows the OS and reacts to OS changes while selected. Reads degrade
 * gracefully when storage is unavailable; a failed read renders the default theme
 * rather than an unstyled page.
 */
export function useTheme(): UseThemeResult {
  const [theme, setThemeState] = useState<ThemePref>("system");
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const pref = readThemePref();
    setThemeState(pref);
    setIsDark(applyTheme(pref) === "dark");

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      if (readThemePref() === "system") {
        setIsDark(applyTheme("system") === "dark");
      }
    };
    mq.addEventListener?.("change", onSystemChange);
    return () => mq.removeEventListener?.("change", onSystemChange);
  }, []);

  const setTheme = useCallback((pref: ThemePref) => {
    writeThemePref(pref);
    setThemeState(pref);
    setIsDark(applyTheme(pref) === "dark");
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolveTheme(readThemePref()) === "dark" ? "light" : "dark");
  }, [setTheme]);

  return { theme, isDark, setTheme, toggleTheme };
}
