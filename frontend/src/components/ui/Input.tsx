import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  /**
   * `"accent"` (default) — brand amber uppercase small-caps label. Use for
   * prominent one-off inputs (settings, rejection reason, etc).
   *
   * `"quiet"` — small slate label. Use when the form has many fields and the
   * amber would create visual noise.
   */
  labelTone?: "accent" | "quiet";
  /**
   * Size of the input. `"md"` = default p-3. `"sm"` = p-2 text-sm, for
   * dense tabular forms.
   */
  size?: "sm" | "md";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, labelTone = "accent", size = "md", ...props }, ref) => {
    const inputId = id ?? props.name ?? undefined;
    return (
      <div className="w-full">
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
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined}
          className={cn(
            "block w-full border bg-stone/50 text-graphite",
            // Mobile: 44px tap target across both sizes; md+ keeps the
            // original density so dense tabular forms still feel tight.
            size === "sm"
              ? "min-h-[44px] md:min-h-0 p-2 text-sm md:text-sm"
              : "min-h-[44px] md:min-h-0 p-3 text-base md:text-sm",
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
