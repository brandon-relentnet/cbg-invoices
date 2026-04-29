import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomTabBar } from "./BottomTabBar";
import { MobileAppBar, MobileAppBarProvider } from "./MobileAppBar";
import { MoreSheet } from "./MoreSheet";

/**
 * Two distinct layouts depending on viewport:
 *
 *   Mobile (<md):
 *     [MobileAppBar  — sticky top, page title + optional action]
 *     [Main scroll   — content with px-4 padding]
 *     [BottomTabBar  — sticky bottom, 5 tabs incl. "More" sheet]
 *
 *   Desktop (md+):
 *     [Sidebar       — primary nav, in-flow column on the left]
 *     [TopBar        — section banner]
 *     [Main scroll   — content with px-8 padding]
 *
 * Pages drive the mobile app bar via `useMobileAppBar({ title, action })`
 * exported from MobileAppBar. The provider wraps the whole shell so any
 * page-level component can register its title without prop drilling.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <MobileAppBarProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-stone">
        {/* Desktop sidebar — display:none below md */}
        <Sidebar />

        <div className="flex flex-col flex-1 min-w-0">
          {/* Desktop top bar */}
          <TopBar />

          {/* Mobile top bar (sticks to top of the scroll area) */}
          <MobileAppBar />

          <main
            className="flex-1 overflow-y-auto overflow-x-clip bg-stone bg-dots"
            style={{
              // Reserve space for the bottom tab bar on mobile so content
              // never sits underneath the last tab.
              paddingBottom: "calc(4rem + env(safe-area-inset-bottom))",
            }}
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-5 md:py-8">
              {children}
            </div>
          </main>

          {/* On md+ the padding-bottom above is wasted (16px-ish); reset it */}
          <style>{`
            @media (min-width: 768px) {
              main { padding-bottom: 0 !important; }
            }
          `}</style>
        </div>

        {/* Mobile bottom tabs — display:none on md+ */}
        <BottomTabBar
          moreOpen={moreOpen}
          onOpenMore={() => setMoreOpen(true)}
        />
        <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      </div>
    </MobileAppBarProvider>
  );
}

/**
 * Page header with the "Our **Values**" accent pattern. Desktop-only by
 * default — pages are expected to call `useMobileAppBar()` for the
 * mobile equivalent.
 */
export function PageHeader({
  title,
  accent,
  subtitle,
  actions,
}: {
  title: string;
  accent?: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="hidden md:flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 md:mb-8 pb-5 md:pb-6 border-b border-stone/80">
      <div className="min-w-0">
        <h1 className="font-display text-3xl sm:text-4xl text-navy leading-tight">
          {title}
          {accent && <span className="text-amber"> {accent}</span>}
        </h1>
        {subtitle && (
          <p className="mt-2 text-sm sm:text-base text-slate-600">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-bold uppercase tracking-widest text-amber mb-2">
      {children}
    </div>
  );
}
