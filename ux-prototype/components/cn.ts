import clsx, { type ClassValue } from 'clsx';

/**
 * Merge conditional class names into a single string.
 *
 * @param a - Any number of class values (strings, arrays, objects, falsy values).
 * @returns The merged className string.
 * @example
 * cn('p-4', isActive && 'bg-primary', ['rounded-xl'])
 */
export const cn = (...a: ClassValue[]): string => clsx(a);

export default cn;
