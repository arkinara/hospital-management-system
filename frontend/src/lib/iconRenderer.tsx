import React from "react";
import * as Lucide from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { IconRenderer } from "@/components/ui/StatusChip";

/**
 * Lucide adapter for the demo / dev paths.
 *
 * The component library deliberately takes an injected `renderIcon` rather than
 * importing an icon package, so this is the single place the app couples to
 * Lucide. Swap this file to change icon sets without touching a component.
 *
 * Glyph keys in the design system are kebab-case (`log-in`, `moon-star`); Lucide
 * exports PascalCase (`LogIn`, `MoonStar`), so the lookup converts between them.
 */
const pascal = (name: string): string =>
  name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");

const registry = Lucide as unknown as Record<string, LucideIcon>;

/** A `renderIcon` bound to the Lucide set. `name` is a kebab-case glyph key. */
export const renderIcon: IconRenderer = (name, className) => {
  const Icon = registry[pascal(name)] ?? Lucide.Circle;
  return React.createElement(Icon, { className, "aria-hidden": true, focusable: false });
};
