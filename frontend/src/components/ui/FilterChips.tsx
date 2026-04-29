/**
 * Horizontal-scrolling segmented control for status filters.
 *
 * - No wrap (which on mobile makes the whole filter row jump heights as
 *   you switch tabs).
 * - Scroll snap so each chip clicks into place.
 * - Active chip: amber background + navy text.
 * - Touch-friendly (44px min height).
 */
import { cn } from "@/lib/cn";

export interface FilterChip<K extends string = string> {
  key: K;
  label: string;
  count?: number;
}

interface Props<K extends string> {
  chips: FilterChip<K>[];
  active: K;
  onChange: (key: K) => void;
  className?: string;
}

export function FilterChips<K extends string>({
  chips,
  active,
  onChange,
  className,
}: Props<K>) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex items-center gap-2 overflow-x-auto scroll-smooth",
        // Hide scrollbar (cosmetic; iOS shows it on scroll only anyway)
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        // Negative inline margin so chips can scroll edge-to-edge while
        // page padding is preserved on the parent.
        "-mx-1 px-1 py-1",
        // Snap behavior on touch devices
        "snap-x snap-mandatory",
        className,
      )}
    >
      {chips.map((chip) => {
        const isActive = chip.key === active;
        return (
          <button
            key={chip.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(chip.key)}
            className={cn(
              "snap-start flex-shrink-0 inline-flex items-center gap-1.5",
              "min-h-[36px] md:min-h-0 px-3 py-1.5",
              "text-xs font-bold uppercase tracking-wider",
              "border transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-1",
              isActive
                ? "bg-navy text-stone border-navy"
                : "bg-white text-slate-600 border-slate-300 hover:border-navy",
            )}
          >
            {chip.label}
            {typeof chip.count === "number" && (
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[1.25rem] h-[1.1rem] px-1 text-[10px]",
                  isActive ? "bg-amber text-navy" : "bg-slate-100 text-slate-600",
                )}
              >
                {chip.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
