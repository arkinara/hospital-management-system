import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class values.
 *
 * clsx for conditional classes, tailwind-merge so a caller's `className`
 * reliably wins over a component's default utility of the same kind
 * (`px-3` passed in beats the component's own `px-3.5`).
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
