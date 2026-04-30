/**
 * SearchableSelect — a dropdown that stores an opaque ID but displays a
 * human-readable label. Built specifically for vendor + project pickers
 * where the form needs to round-trip a UUID through the backend but the
 * user is choosing by name.
 *
 * Why not native <select>?
 *   It works, but the controlled-value model has rendered unreliably in
 *   our layout (multiple iterations of "I clicked X, picked Y, but the
 *   selection didn't stick"). This component manages display + state
 *   itself with no dependence on browser select behaviour.
 *
 * Behavior:
 *   - Closed: shows the matched option's label, or the placeholder if
 *     value is empty / unmatched.
 *   - Click input or chevron: opens the dropdown.
 *   - Type to filter the option list by label.
 *   - Click an option, or use ↓/↑ + Enter, to commit. Esc / outside
 *     click closes without committing.
 *   - "Clear" option at the top of the list when current value is set,
 *     so users can wipe the selection without manual control nuance.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronDownIcon, CheckIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";

export interface SearchableSelectOption {
  /** Stored value — typically a UUID. */
  value: string;
  /** Display label shown in the input + dropdown. */
  label: string;
  /** Optional secondary text (e.g. an account number). */
  hint?: string;
}

interface Props {
  label?: string;
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  labelTone?: "accent" | "quiet";
  /** Label for the clear option in the dropdown. Set to null to hide. */
  clearLabel?: string | null;
}

export const SearchableSelect = forwardRef<HTMLInputElement, Props>(
  (
    {
      label,
      options,
      value,
      onChange,
      placeholder = "Select…",
      className,
      id,
      name,
      disabled,
      labelTone = "quiet",
      clearLabel = "— clear —",
    },
    ref,
  ) => {
    const inputId = id ?? name ?? undefined;
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [highlight, setHighlight] = useState(-1);
    const rootRef = useRef<HTMLDivElement>(null);

    // Find currently-selected option
    const selected = useMemo(
      () => options.find((o) => o.value === value),
      [options, value],
    );

    // The text shown in the input — matched label when closed, search
    // query when open + actively typing.
    const displayValue = open ? query : selected?.label ?? "";

    const filtered = useMemo(() => {
      const needle = query.trim().toLowerCase();
      if (!needle) return options;
      return options.filter(
        (o) =>
          o.label.toLowerCase().includes(needle) ||
          o.hint?.toLowerCase().includes(needle),
      );
    }, [query, options]);

    // Close on outside click
    useEffect(() => {
      if (!open) return;
      function onPointerDown(e: PointerEvent) {
        if (!rootRef.current) return;
        if (!rootRef.current.contains(e.target as Node)) {
          commitClose();
        }
      }
      window.addEventListener("pointerdown", onPointerDown);
      return () => window.removeEventListener("pointerdown", onPointerDown);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const commitClose = useCallback(() => {
      setOpen(false);
      setQuery("");
      setHighlight(-1);
    }, []);

    const select = useCallback(
      (next: string) => {
        onChange(next);
        commitClose();
      },
      [onChange, commitClose],
    );

    function openDropdown() {
      if (disabled) return;
      if (!open) {
        setOpen(true);
        setQuery("");
        // Highlight the currently-selected row, or first row if none
        const idx = options.findIndex((o) => o.value === value);
        setHighlight(idx >= 0 ? idx : 0);
      }
    }

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
      if (disabled) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!open) {
          openDropdown();
          return;
        }
        setHighlight((h) => (h + 1 >= filtered.length ? 0 : h + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!open) {
          openDropdown();
          return;
        }
        setHighlight((h) => (h <= 0 ? filtered.length - 1 : h - 1));
      } else if (e.key === "Enter") {
        if (open && highlight >= 0 && highlight < filtered.length) {
          e.preventDefault();
          select(filtered[highlight].value);
        }
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        commitClose();
      } else if (e.key === "Tab" && open) {
        commitClose();
      } else if (e.key === "Backspace" && open && query === "") {
        // Pressing backspace on an empty filter clears the selection
        if (value) {
          e.preventDefault();
          select("");
        }
      }
    }

    return (
      <div ref={rootRef} className={cn("w-full", className)}>
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              "block mb-1",
              labelTone === "accent"
                ? "text-xs font-bold uppercase tracking-widest text-amber mb-1.5"
                : "text-xs font-medium text-slate-600",
            )}
          >
            {label}
          </label>
        )}

        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            name={name}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={inputId ? `${inputId}-listbox` : undefined}
            disabled={disabled}
            value={displayValue}
            placeholder={placeholder}
            onFocus={openDropdown}
            onClick={openDropdown}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
              if (!open) setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            className={cn(
              "block w-full border bg-stone/50 text-graphite",
              "h-10 px-3 py-2 pr-9 text-base md:text-sm",
              "focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber",
              "placeholder:text-slate-400",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "border-slate-300",
              // When closed and a value is selected, the displayed label
              // shouldn't look like a placeholder.
              !open && selected && "text-graphite",
              // Visual cue that this is a button-like input
              "cursor-pointer",
            )}
          />
          <button
            type="button"
            onClick={() => (open ? commitClose() : openDropdown())}
            tabIndex={-1}
            aria-label="Toggle options"
            className="absolute inset-y-0 right-0 px-2 text-slate-500 hover:text-navy disabled:opacity-50"
            disabled={disabled}
          >
            <ChevronDownIcon
              className={cn(
                "h-4 w-4 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>

          {open && (
            <ul
              id={inputId ? `${inputId}-listbox` : undefined}
              role="listbox"
              className="absolute left-0 right-0 top-full mt-1 z-40 max-h-60 overflow-y-auto bg-white border border-slate-300 shadow-lg"
            >
              {clearLabel && value && (
                <li role="option">
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      // Use mousedown to fire BEFORE blur. Otherwise the
                      // outside-click handler can race with the click and
                      // close the dropdown without committing.
                      e.preventDefault();
                      select("");
                    }}
                    className="w-full text-left px-3 py-2 text-sm italic text-slate-500 hover:bg-stone/40 hover:text-graphite border-b border-stone/60"
                  >
                    {clearLabel}
                  </button>
                </li>
              )}
              {filtered.length === 0 && (
                <li className="px-3 py-3 text-xs text-slate-500">
                  No matches.
                </li>
              )}
              {filtered.map((o, i) => {
                const highlighted = i === highlight;
                const isSelected = o.value === value;
                return (
                  <li key={o.value} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(i)}
                      onMouseDown={(e) => {
                        // mousedown beats the outside-click race.
                        e.preventDefault();
                        select(o.value);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors",
                        highlighted
                          ? "bg-amber/10 text-navy"
                          : isSelected
                            ? "bg-stone/40"
                            : "hover:bg-stone/40",
                      )}
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block text-graphite truncate">
                          {o.label}
                        </span>
                        {o.hint && (
                          <span className="block text-xs text-slate-500 truncate">
                            {o.hint}
                          </span>
                        )}
                      </span>
                      {isSelected && (
                        <CheckIcon
                          className="h-4 w-4 text-amber flex-shrink-0"
                          aria-hidden
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  },
);
SearchableSelect.displayName = "SearchableSelect";
