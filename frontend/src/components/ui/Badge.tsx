import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone =
  | "slate"
  | "blue"
  | "amber"
  | "green"
  | "red"
  | "navy";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  children: ReactNode;
}

const toneClasses: Record<Tone, string> = {
  slate: "bg-slate-200 text-slate-800 border border-slate-300",
  blue: "bg-blue-100 text-blue-900 border border-blue-300",
  amber: "bg-amber/20 text-navy border border-amber",
  green: "bg-green-100 text-green-900 border border-green-400",
  red: "bg-red-100 text-red-900 border border-red-400",
  navy: "bg-navy text-stone border border-amber",
};

export function Badge({ tone = "slate", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
