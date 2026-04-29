import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-amber text-navy font-semibold hover:bg-amber/90 disabled:opacity-50 disabled:cursor-not-allowed",
  secondary:
    "bg-transparent text-navy border-2 border-navy hover:bg-navy hover:text-stone disabled:opacity-50",
  ghost:
    "bg-transparent text-graphite hover:bg-graphite/5 disabled:opacity-50",
  destructive:
    "bg-red-700 text-stone hover:bg-red-800 disabled:opacity-50",
};

const sizeStyles: Record<Size, string> = {
  // Mobile gets a 44px tap target across all sizes (Apple HIG / WCAG 2.5.5);
  // md+ shrinks back to the original densities.
  sm: "min-h-[44px] md:min-h-0 px-3 py-1.5 text-sm",
  md: "min-h-[44px] md:min-h-0 px-4 py-2 text-sm",
  lg: "min-h-[44px] md:min-h-0 px-6 py-3 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", loading = false, children, disabled, ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2",
          "rounded-none transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2",
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...props}
      >
        {loading && (
          <span
            aria-hidden
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
