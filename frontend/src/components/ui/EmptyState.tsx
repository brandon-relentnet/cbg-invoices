/**
 * EmptyState — used by every list page when there's nothing to show.
 *
 * Visual: amber-tinted icon circle, DM Serif Display headline, body
 * paragraph, optional CTA. Centered, generous vertical breathing room.
 */
import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  /** Body copy — keep to ~2 lines. */
  body?: string;
  /** Optional CTA — `<Button>`, `<Link>`, etc. */
  cta?: ReactNode;
  className?: string;
}

export function EmptyState({
  Icon,
  title,
  body,
  cta,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "px-6 py-14 md:py-20 text-center flex flex-col items-center",
        className,
      )}
    >
      <span
        aria-hidden
        className="inline-flex items-center justify-center h-14 w-14 bg-amber/10 border border-amber/30 mb-4"
      >
        <Icon className="h-7 w-7 text-amber" />
      </span>
      <p className="font-display text-xl text-navy">{title}</p>
      {body && (
        <p className="text-sm text-slate-500 mt-2 max-w-sm leading-relaxed">
          {body}
        </p>
      )}
      {cta && <div className="mt-5">{cta}</div>}
    </div>
  );
}
