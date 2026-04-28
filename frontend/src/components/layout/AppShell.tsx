import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: ReactNode }) {
  // On <md the sidebar is a slide-out drawer toggled from the TopBar.
  // On md+ it's always visible in flow and this state is ignored.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close the drawer on every route change so navigating doesn't leave it
  // hanging open over the new page.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  // Esc closes the drawer
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone">
      {/* Mobile backdrop */}
      {drawerOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
          className="md:hidden fixed inset-0 bg-graphite/50 z-30"
        />
      )}

      <Sidebar
        drawerOpen={drawerOpen}
        onCloseDrawer={() => setDrawerOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0">
        <TopBar onToggleMenu={() => setDrawerOpen((v) => !v)} />
        <main className="flex-1 overflow-y-auto bg-stone bg-dots">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Page header with the "Our **Values**" accent pattern.
 * Second word is highlighted in amber.
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
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 md:mb-8 pb-5 md:pb-6 border-b border-stone/80">
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
