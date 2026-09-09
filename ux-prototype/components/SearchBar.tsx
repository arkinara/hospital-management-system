import { useEffect, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from './cn';

export interface SearchBarProps {
  /** Controlled input value. */
  value: string;
  /** Immediate change handler on every keystroke. */
  onChange: (value: string) => void;
  /** Debounced change handler, fired after debounceMs of inactivity. */
  onDebouncedChange?: (value: string) => void;
  /** Debounce delay in milliseconds. */
  debounceMs?: number;
  /** Placeholder text. */
  placeholder?: string;
  /** Optional result-count slot rendered at the trailing edge. */
  resultCount?: ReactNode;
  /** Additional root classes. */
  className?: string;
}

/**
 * A Material Design 3 rounded search field with debounced change and clear.
 *
 * @param value - Controlled value.
 * @param onChange - Immediate change handler.
 * @param onDebouncedChange - Debounced change handler.
 * @param debounceMs - Debounce delay (default 300ms).
 * @param placeholder - Placeholder text.
 * @param resultCount - Trailing result-count slot.
 * @param className - Additional root classes.
 * @example
 * <SearchBar value={q} onChange={setQ} onDebouncedChange={runSearch} resultCount="12 results" />
 */
const SearchBar = ({
  value,
  onChange,
  onDebouncedChange,
  debounceMs = 300,
  placeholder = 'Search…',
  resultCount,
  className,
}: SearchBarProps) => {
  const [internal, setInternal] = useState(value);

  useEffect(() => {
    setInternal(value);
  }, [value]);

  useEffect(() => {
    if (!onDebouncedChange) return;
    const t = setTimeout(() => onDebouncedChange(internal), debounceMs);
    return () => clearTimeout(t);
  }, [internal, debounceMs, onDebouncedChange]);

  const handleChange = (v: string) => {
    setInternal(v);
    onChange(v);
  };

  return (
    <div
      className={cn(
        'flex h-12 items-center gap-2 rounded-full bg-surface-container-high px-4',
        className,
      )}
    >
      <Search size={20} strokeWidth={2} className="shrink-0 text-foreground/70" />
      <input
        type="search"
        value={internal}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/50"
      />
      {resultCount != null && (
        <span className="shrink-0 text-xs text-foreground/70">{resultCount}</span>
      )}
      {internal && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => handleChange('')}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/70 transition-colors duration-200 hover:bg-surface-container-highest"
        >
          <X size={20} strokeWidth={2} />
        </button>
      )}
    </div>
  );
};

export default SearchBar;
