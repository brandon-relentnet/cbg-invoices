import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  accent?: "left" | "top" | "bottom" | "none";
  dark?: boolean;
}

export function Card({
  accent = "none",
  dark = false,
  className,
  children,
  ...props
}: CardProps) {
  const accentClasses = {
    left: "border-l-2 border-amber",
    top: "border-t-4 border-amber",
    bottom: "border-b-2 border-amber",
    none: "",
  }[accent];

  return (
    <div
      className={cn(
        dark ? "bg-navy text-stone" : "bg-white",
        "shadow-sm",
        accentClasses,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("px-6 py-4 border-b border-stone/60", className)}>{children}</div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-6 py-5", className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("px-6 py-4 border-t border-stone/60", className)}>{children}</div>
  );
}
