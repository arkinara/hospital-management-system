import clsx, { type ClassValue } from 'clsx';

/**
 * Merge class values.
 *
 * A thin wrapper over clsx so every component has one import for conditional
 * classes and call sites stay readable.
 */
export const cn = (...inputs: ClassValue[]): string => clsx(inputs);
