import React from 'react';
import { cn } from './cn';
import type { IconRenderer } from './StatusChip';

export interface CommandItem {
  id: string;
  /** Section heading, e.g. "Patients", "Actions", "Go to". */
  group: string;
  label: string;
  /** Secondary line: MRN, department, shortcut hint. */
  meta: string;
  icon: string;
  onRun: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  items: CommandItem[];
  onClose: () => void;
  renderIcon: IconRenderer;
  /** Shown when nothing matches. Suggest a query shape that would work. */
  emptyHint?: string;
  placeholder?: string;
  maxResults?: number;
}

/**
 * Command palette (⌘K / Ctrl+K).
 *
 * For staff who already know where they are going, navigating to a destination is
 * pure overhead — this collapses "find the patient, open the record" into typing a
 * name. Patients, actions and destinations share one list so the user does not have
 * to know which kind of thing they are looking for.
 *
 * Implemented as a proper combobox: `role="combobox"` on the input with
 * `aria-activedescendant` tracking the highlighted option, arrow keys to move,
 * Enter to run, Escape to close, and focus returned to the opener.
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  items,
  onClose,
  renderIcon,
  emptyHint = 'Try an MRN like P-001042.',
  placeholder = 'Patient name, MRN, or an action…',
  maxResults = 40,
}) => {
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const openerRef = React.useRef<Element | null>(null);
  const listId = React.useId();

  const results = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = needle
      ? items.filter((i) => `${i.label} ${i.meta}`.toLowerCase().includes(needle))
      : items;
    return pool.slice(0, maxResults);
  }, [items, query, maxResults]);

  React.useEffect(() => setActive(0), [query]);

  React.useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    setQuery('');
    setActive(0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      (openerRef.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const run = (index: number) => {
    const item = results[index];
    if (!item) return;
    onClose();
    item.onRun();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (results.length ? (a + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup = '';

  return (
    <>
      <div
        className="fixed inset-0 z-scrim anim-scrim"
        style={{ background: 'rgb(var(--scrim) / var(--scrim-alpha))', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <div className="fixed inset-0 z-overlay grid place-items-start sm:place-items-center p-3 sm:p-4 overflow-y-auto pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search or jump to"
          className="pointer-events-auto anim-sheet w-full sm:max-w-2xl bg-surface-0 border border-outline rounded-2xl shadow-overlay p-4"
        >
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">{renderIcon('search', 'w-4 h-4')}</span>
            <input
              ref={inputRef}
              type="search"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={results.length ? `${listId}-${active}` : undefined}
              autoComplete="off"
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={onKeyDown}
              className="w-full min-h-12 rounded-lg bg-surface-2 border border-outline-strong pl-9 pr-3 text-md focus-inset"
            />
          </div>

          <ul ref={listRef} id={listId} role="listbox" aria-label="Results" className="mt-3 max-h-80 overflow-y-auto -mx-1 px-1">
            {results.length === 0 ? (
              <li className="px-3 py-8 text-center text-base text-muted">
                No match for “{query}”. {emptyHint}
              </li>
            ) : (
              results.map((item, index) => {
                const header = item.group !== lastGroup ? item.group : null;
                lastGroup = item.group;
                return (
                  <React.Fragment key={item.id}>
                    {header ? (
                      <li role="presentation" className="px-2 pt-3 pb-1 text-2xs font-semibold uppercase tracking-wide text-subtle">
                        {header}
                      </li>
                    ) : null}
                    <li
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={index === active}
                      data-index={index}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => run(index)}
                      className={cn(
                        'flex items-center gap-3 px-2.5 py-2 min-h-11 rounded-lg cursor-pointer',
                        index === active ? 'bg-primary-container text-primary-container-foreground' : 'hover:bg-surface-2',
                      )}
                    >
                      <span className="text-muted shrink-0">{renderIcon(item.icon, 'w-4 h-4')}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-base font-medium truncate">{item.label}</span>
                        <span className="block text-xs text-muted truncate num">{item.meta}</span>
                      </span>
                      {renderIcon('arrow-right', 'w-3.5 h-3.5 text-subtle')}
                    </li>
                  </React.Fragment>
                );
              })
            )}
          </ul>

          <p className="mt-3 pt-3 border-t border-outline text-xs text-subtle flex flex-wrap gap-x-4 gap-y-1">
            <span>
              <kbd className="num">↑ ↓</kbd> move
            </span>
            <span>
              <kbd className="num">Enter</kbd> open
            </span>
            <span>
              <kbd className="num">Esc</kbd> close
            </span>
          </p>
        </div>
      </div>
    </>
  );
};
