/**
 * Top bar.
 *
 * - On <md: shows a hamburger that toggles the sidebar drawer + shows the
 *   Cambridge wordmark since the sidebar isn't visible.
 * - On md+: just a thin section label since the sidebar already provides
 *   navigation + branding.
 */
import { Bars3Icon } from "@heroicons/react/24/outline";

export function TopBar({ onToggleMenu }: { onToggleMenu: () => void }) {
  return (
    <header className="h-14 bg-white border-b border-stone/80 flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMenu}
          aria-label="Open menu"
          className="md:hidden -ml-2 p-2 text-graphite hover:text-navy"
        >
          <Bars3Icon className="h-6 w-6" />
        </button>

        {/* Mobile-only mini wordmark — visible because sidebar is hidden */}
        <div className="md:hidden flex items-baseline gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber">
            Cambridge
          </span>
          <span className="font-display text-base text-navy leading-none">
            Portal
          </span>
        </div>

        {/* Desktop section label */}
        <div className="hidden md:block text-xs font-bold uppercase tracking-widest text-slate-500">
          Accounts Payable
        </div>
      </div>
    </header>
  );
}
