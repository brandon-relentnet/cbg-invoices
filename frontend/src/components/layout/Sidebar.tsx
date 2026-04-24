import { Link, useLocation } from "@tanstack/react-router";
import {
  DocumentTextIcon,
  BuildingOffice2Icon,
  FolderIcon,
  ClockIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/cn";

interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const NAV: NavItem[] = [
  { to: "/invoices", label: "Invoices", Icon: DocumentTextIcon },
  { to: "/vendors", label: "Vendors", Icon: BuildingOffice2Icon },
  { to: "/projects", label: "Projects", Icon: FolderIcon },
  { to: "/audit", label: "Audit log", Icon: ClockIcon },
  { to: "/settings", label: "Settings", Icon: Cog6ToothIcon },
];

export function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="relative w-60 flex-shrink-0 bg-graphite bg-grid bg-noise text-stone overflow-hidden">
      <div className="relative z-10 flex flex-col h-full">
        {/* Brand */}
        <div className="px-6 py-6 border-b border-stone/10">
          <div className="text-xs font-bold uppercase tracking-widest text-amber">
            Cambridge
          </div>
          <div className="font-display text-xl text-stone leading-tight mt-0.5">
            Invoice Portal
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4">
          <ul className="space-y-0.5">
            {NAV.map(({ to, label, Icon }) => {
              const active = pathname === to || pathname.startsWith(`${to}/`);
              return (
                <li key={to}>
                  <Link
                    to={to}
                    className={cn(
                      "flex items-center gap-3 px-6 py-2.5 text-sm transition-colors",
                      "border-l-2",
                      active
                        ? "border-amber text-stone bg-white/5"
                        : "border-transparent text-slate-400 hover:text-stone hover:bg-white/5",
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span>{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="px-6 py-4 text-[11px] text-slate-500 border-t border-stone/10">
          <div className="font-mono">v0.1.0</div>
        </div>
      </div>
    </aside>
  );
}
