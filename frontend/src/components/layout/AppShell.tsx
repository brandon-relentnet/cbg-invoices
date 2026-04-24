import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto bg-stone bg-dots">
          <div className="max-w-7xl mx-auto px-8 py-8">{children}</div>
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
    <div className="flex items-start justify-between mb-8 pb-6 border-b border-stone/80">
      <div>
        <h1 className="font-display text-4xl text-navy leading-tight">
          {title}
          {accent && <span className="text-amber"> {accent}</span>}
        </h1>
        {subtitle && <p className="mt-2 text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
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
