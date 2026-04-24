import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? props.name ?? undefined;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-bold uppercase tracking-widest text-amber mb-1.5"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined}
          className={cn(
            "block w-full p-3 border bg-stone/50 text-graphite",
            "focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber",
            "placeholder:text-slate-400",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            error ? "border-red-600" : "border-slate-300",
            className,
          )}
          {...props}
        />
        {error && (
          <p id={`${inputId}-err`} className="mt-1 text-xs text-red-700">
            {error}
          </p>
        )}
        {!error && hint && (
          <p id={`${inputId}-hint`} className="mt-1 text-xs text-slate-500">
            {hint}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
