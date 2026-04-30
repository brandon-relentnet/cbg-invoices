/**
 * Combobox — a text input with a dropdown of curated options. Users can
 * either pick from the list OR type a free-form custom value.
 *
 * Designed for the AP coding fields (job number, cost code, approver)
 * where admins maintain a curated list but PMs occasionally need to enter
 * a code that isn't in the list yet.
 *
 * Behavior:
 *   - Click input or ↓ button: dropdown opens, scrolled to the matching
 *     option (if value matches).
 *   - Type: dropdown filters options that start with or contain the
 *     typed text. Free-text typed values become the value on blur.
 *   - Pick an option: value is set to that option's `value` and dropdown
 *     closes.
 *   - Esc / click outside: dropdown closes, current value preserved.
 *   - Down/Up arrows navigate the dropdown.
 *   - Enter on a highlighted option selects it; Enter on free text
 *     keeps the typed value.
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
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";

export interface ComboboxOption {
  value: string;
  label?: string | null;
}

interface ComboboxProps {
  label?: string;
  hint?: string;
  error?: string;
  /** Curated dropdown options (admin-managed). */
  options: ComboboxOption[];
  /** Current free-text value. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  /** Optional accent label tone — same options as Input. */
  labelTone?: "accent" | "quiet";
  /** Custom display when value isn't in options. Default: italic "(custom)". */
  customSuffix?: string;
}

export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(
  (
    {
      label,
      hint,
      error,
      options,
      value,
      onChange,
      placeholder,
      className,
      id,
      name,
      disabled,
      labelTone = "quiet",
      customSuffix = "(custom)",
    },
    ref,
  ) => {
    const inputId = id ?? name ?? undefined;
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState<number>(-1);
    const containerRef = useRef<HTMLDivElement>(null);

    // Filter options based on the current input text. Empty input shows all.
    const filtered = useMemo(() => {
      const needle = value.trim().toLowerCase();
      if (!needle) return options;
      return options.filter((o) => {
        const v = o.value.toLowerCase();
        const l = (o.label ?? "").toLowerCase();
        return v.includes(needle) || l.includes(needle);
      });
    }, [value, options]);

    const isCustom =
      value.trim().length > 0 &&
      !options.some((o) => o.value.toLowerCase() === value.trim().toLowerCase());

    // Close on outside click
    useEffect(() => {
      if (!open) return;
      function onPointerDown(e: PointerEvent) {
        if (!containerRef.current) return;
        if (!containerRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      }
      window.addEventListener("pointerdown", onPointerDown);
      return () => window.removeEventListener("pointerdown", onPointerDown);
    }, [open]);

    const selectOption = useCallback(
      (opt: ComboboxOption) => {
        onChange(opt.value);
        setOpen(false);
        setHighlight(-1);
      },
      [onChange],
    );

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
      if (disabled) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setHighlight(0);
          return;
        }
        setHighlight((h) => (h + 1 >= filtered.length ? 0 : h + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setHighlight(filtered.length - 1);
          return;
        }
        setHighlight((h) => (h <= 0 ? filtered.length - 1 : h - 1));
      } else if (e.key === "Enter") {
        if (open && highlight >= 0 && highlight < filtered.length) {
          e.preventDefault();
          selectOption(filtered[highlight]);
        } else if (open) {
          // Enter on free text — keep typed value, close dropdown.
          setOpen(false);
        }
      } else if (e.key === "Escape") {
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
      } else if (e.key === "Tab") {
        setOpen(false);
      }
    }

    return (
      <div className={cn("w-full", className)} ref={containerRef}>
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

        {/* Input + chevron + dropdown — wrapped in `relative` so the
            dropdown can absolute-position over surrounding content
            instead of pushing siblings down. */}
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
            aria-invalid={!!error}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              if (!open) setOpen(true);
              setHighlight(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              "block w-full border bg-stone/50 text-graphite font-mono",
              "min-h-[44px] md:min-h-0 pl-3 pr-9 py-3 md:py-2 text-base md:text-sm",
              "focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber",
              "placeholder:text-slate-400 placeholder:font-sans",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              error ? "border-red-600" : "border-slate-300",
            )}
          />
          <button
            type="button"
            onClick={() => {
              if (disabled) return;
              setOpen((o) => !o);
            }}
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

          {/* Dropdown — absolutely positioned just below the input,
              floats over whatever comes next without layout shift. */}
          {open && (
            <ul
              id={inputId ? `${inputId}-listbox` : undefined}
              role="listbox"
              className="absolute left-0 right-0 top-full mt-1 z-40 max-h-60 overflow-y-auto bg-white border border-slate-300 shadow-lg"
            >
              {filtered.length === 0 && (
                <li className="px-3 py-3 text-xs text-slate-500">
                  No matching options. Type a value to use as custom.
                </li>
              )}
              {filtered.map((o, i) => {
                const highlighted = i === highlight;
                const selected =
                  value.trim().toLowerCase() === o.value.toLowerCase();
                return (
                  <li key={o.value} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => selectOption(o)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm flex items-baseline justify-between gap-3 transition-colors",
                        highlighted
                          ? "bg-amber/10 text-navy"
                          : selected
                            ? "bg-stone/40"
                            : "hover:bg-stone/40",
                      )}
                    >
                      <span className="font-mono font-medium text-graphite truncate">
                        {o.value}
                      </span>
                      {o.label && (
                        <span className="text-xs text-slate-500 truncate">
                          {o.label}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Custom-value indicator */}
        {isCustom && !open && (
          <p className="mt-1 text-[10px] text-amber font-semibold uppercase tracking-wider">
            {customSuffix}
          </p>
        )}

        {error && (
          <p className="mt-1 text-xs text-red-700">{error}</p>
        )}
        {!error && hint && (
          <p className="mt-1 text-xs text-slate-500">{hint}</p>
        )}
      </div>
    );
  },
);
Combobox.displayName = "Combobox";
