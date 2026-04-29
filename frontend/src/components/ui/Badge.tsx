import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "slate" | "blue" | "amber" | "green" | "red" | "navy";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  children: ReactNode;
  /** Show a leading status dot. Defaults amber unless `dotColor` overrides. */
  dot?: boolean;
  /** Hex/CSS color for the dot when `dot` is true. */
  dotColor?: string;
  /** Pulse the dot — useful for in-flight states like Extracting. */
  pulseDot?: boolean;
}

const toneClasses: Record<Tone, string> = {
  // Bumped contrast on borders + text so badges read clearly on stone bg
  slate: "bg-slate-100 text-slate-900 border border-slate-400",
  blue: "bg-blue-50 text-blue-900 border border-blue-400",
  amber: "bg-amber/15 text-navy border border-amber",
  green: "bg-green-50 text-green-900 border border-green-500",
  red: "bg-red-50 text-red-900 border border-red-500",
  navy: "bg-navy text-stone border border-amber",
};

export function Badge({
  tone = "slate",
  dot = false,
  dotColor,
  pulseDot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          aria-hidden
          className={cn(
            "relative inline-block h-1.5 w-1.5 rounded-full flex-shrink-0",
            !dotColor && "bg-amber",
          )}
          style={dotColor ? { backgroundColor: dotColor } : undefined}
        >
          {pulseDot && (
            <span
              aria-hidden
              className="absolute inset-0 rounded-full animate-ping"
              style={{
                backgroundColor: dotColor ?? "#c8923c",
                opacity: 0.5,
              }}
            />
          )}
        </span>
      )}
      {children}
    </span>
  );
}
