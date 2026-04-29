import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "destructive";

export interface SplitButtonOption {
  /** Short label shown in the dropdown list. */
  label: string;
  /** Optional second line for context (e.g. "also posts to QBO"). */
  description?: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Renders a `<hr/>` above this item. Useful for grouping. */
  divider?: boolean;
  /** Tone the item destructive (red on hover). */
  destructive?: boolean;
  /** Optional leading icon (Heroicons-style component). */
  icon?: ReactNode;
}

interface SplitButtonProps {
  /** Primary button label. */
  primaryLabel: ReactNode;
  /** Fired when the primary button is clicked. */
  onPrimary: () => void;
  /** Dropdown contents. */
  options: SplitButtonOption[];
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  /** Tooltip for the primary button. */
  title?: string;
  className?: string;
}

const variantClasses: Record<Variant, { main: string; chevron: string }> = {
  primary: {
    main: "bg-amber text-navy font-semibold hover:bg-amber/90 disabled:opacity-50 disabled:cursor-not-allowed",
    chevron: "bg-amber text-navy hover:bg-amber/90 border-l border-navy/20",
  },
  secondary: {
    main: "bg-transparent text-navy border-2 border-navy hover:bg-navy hover:text-stone disabled:opacity-50",
    chevron: "text-navy border-y-2 border-r-2 border-navy hover:bg-navy hover:text-stone",
  },
  destructive: {
    main: "bg-red-700 text-stone font-semibold hover:bg-red-800 disabled:opacity-50",
    chevron: "bg-red-700 text-stone hover:bg-red-800 border-l border-stone/30",
  },
};

export function SplitButton({
  primaryLabel,
  onPrimary,
  options,
  variant = "primary",
  disabled = false,
  loading = false,
  title,
  className,
}: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click and Escape
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const v = variantClasses[variant];

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={onPrimary}
        disabled={disabled || loading}
        title={title}
        className={cn(
          "flex-1 sm:flex-initial inline-flex items-center justify-center gap-2",
          "min-h-[44px] md:min-h-0 px-4 py-2 text-sm",
          "transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2",
          v.main,
        )}
      >
        {loading && (
          <span
            aria-hidden
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
        )}
        {primaryLabel}
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || loading || options.length === 0}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        className={cn(
          "min-h-[44px] md:min-h-0 px-3 sm:px-2 py-2",
          "transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2",
          v.chevron,
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <ChevronDownIcon
          className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            // Appear above the button so it doesn't clip under the sticky footer
            className="absolute right-0 bottom-full mb-2 min-w-[260px] bg-white border border-slate-300 shadow-xl z-50"
          >
            <ul className="py-1">
              {options.map((opt, idx) => (
                <li key={idx}>
                  {opt.divider && <hr className="my-1 border-slate-200" />}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={opt.disabled}
                    onClick={() => {
                      opt.onSelect();
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-2.5 flex items-start gap-3",
                      "transition-colors",
                      "disabled:opacity-40 disabled:cursor-not-allowed",
                      opt.destructive
                        ? "hover:bg-red-50 text-red-700"
                        : "hover:bg-amber/10 text-graphite",
                    )}
                  >
                    {opt.icon && (
                      <span className="flex-shrink-0 mt-0.5 text-slate-500">
                        {opt.icon}
                      </span>
                    )}
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{opt.label}</span>
                      {opt.description && (
                        <span className="block text-xs text-slate-500 mt-0.5">
                          {opt.description}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
