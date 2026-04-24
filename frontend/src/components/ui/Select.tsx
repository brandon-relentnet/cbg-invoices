import { forwardRef, type SelectHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  /** See Input — `"accent"` default amber label, `"quiet"` for dense forms. */
  labelTone?: "accent" | "quiet";
  size?: "sm" | "md";
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    { label, error, hint, className, id, children, labelTone = "accent", size = "md", ...props },
    ref,
  ) => {
    const selectId = id ?? props.name ?? undefined;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
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
        <select
          ref={ref}
          id={selectId}
          aria-invalid={!!error}
          className={cn(
            "block w-full border bg-stone/50 text-graphite appearance-none",
            size === "sm" ? "p-2 text-sm" : "p-3",
            "focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            error ? "border-red-600" : "border-slate-300",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
        {!error && hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </div>
    );
  },
);
Select.displayName = "Select";
