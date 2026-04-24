import { forwardRef, type SelectHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className, id, children, ...props }, ref) => {
    const selectId = id ?? props.name ?? undefined;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs font-bold uppercase tracking-widest text-amber mb-1.5"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={!!error}
          className={cn(
            "block w-full p-3 border bg-stone/50 text-graphite appearance-none",
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
      </div>
    );
  },
);
Select.displayName = "Select";
