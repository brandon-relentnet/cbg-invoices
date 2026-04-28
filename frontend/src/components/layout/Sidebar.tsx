import { Link, useLocation } from "@tanstack/react-router";
import { useLogto } from "@logto/react";
import {
  DocumentTextIcon,
  BuildingOffice2Icon,
  FolderIcon,
  ClockIcon,
  Cog6ToothIcon,
  UsersIcon,
  ArrowRightOnRectangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/cn";
import { postSignOutUri, useUser } from "@/lib/auth";
import { useMe } from "@/lib/users";
import { useAccessRequests } from "@/lib/accessRequests";

interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const NAV: NavItem[] = [
  { to: "/invoices", label: "Invoices", Icon: DocumentTextIcon },
  { to: "/vendors", label: "Vendors", Icon: BuildingOffice2Icon },
  { to: "/projects", label: "Projects", Icon: FolderIcon },
  { to: "/team", label: "Team", Icon: UsersIcon },
  { to: "/audit", label: "Audit log", Icon: ClockIcon },
  { to: "/settings", label: "Settings", Icon: Cog6ToothIcon },
];

export function Sidebar({
  drawerOpen = false,
  onCloseDrawer,
}: {
  drawerOpen?: boolean;
  onCloseDrawer?: () => void;
}) {
  const { pathname } = useLocation();
  const me = useMe();
  const canManage = me.data?.role === "owner" || me.data?.role === "admin";
  // Only admins+ get the access-requests query (others would 403)
  const reqQuery = useAccessRequests({ enabled: canManage });
  const pendingCount = reqQuery.data?.pending_count ?? 0;

  return (
    <aside
      className={cn(
        // Below md: fixed-position slide-out drawer with translate transition.
        // md+: normal in-flow column with no transition shenanigans.
        "fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw]",
        "md:relative md:inset-auto md:z-auto md:w-60 md:max-w-none",
        "flex-shrink-0 bg-graphite bg-grid bg-noise text-stone overflow-hidden",
        "transition-transform duration-200 ease-out md:transition-none",
        drawerOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}
      aria-label="Primary navigation"
    >
      <div className="relative z-10 flex flex-col h-full">
        {/* Brand + mobile close button */}
        <div className="px-6 py-6 border-b border-stone/10 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-amber">
              Cambridge
            </div>
            <div className="font-display text-xl text-stone leading-tight mt-0.5">
              Invoice Portal
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseDrawer}
            aria-label="Close menu"
            className="md:hidden -mr-2 -mt-1 p-2 text-slate-400 hover:text-stone"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4">
          <ul className="space-y-0.5">
            {NAV.map(({ to, label, Icon }) => {
              const active = pathname === to || pathname.startsWith(`${to}/`);
              const showBadge = to === "/team" && pendingCount > 0;
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
                    <span className="flex-1">{label}</span>
                    {showBadge && (
                      <span
                        className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 bg-amber text-navy text-[10px] font-bold tracking-wider"
                        aria-label={`${pendingCount} pending request${pendingCount === 1 ? "" : "s"}`}
                      >
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <AccountCard />

        <div className="px-6 py-3 text-[11px] text-slate-500 border-t border-stone/10">
          <div className="font-mono">v0.1.0</div>
        </div>
      </div>
    </aside>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Account card at the bottom of the sidebar — shows who you're signed in as
// plus a sign-out action.
// ──────────────────────────────────────────────────────────────────────────

function AccountCard() {
  const user = useUser();
  const me = useMe();
  const { signOut } = useLogto();

  const role = me.data?.role ?? null;
  const name = user?.name?.trim() || user?.email || "Signed in";
  const email = user?.email ?? null;

  const initials = computeInitials(name, email);

  return (
    <div className="px-4 pt-3 pb-3 border-t border-stone/10 bg-black/20">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex-shrink-0 inline-flex items-center justify-center h-9 w-9 bg-amber text-navy text-xs font-bold tracking-wider"
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-stone truncate leading-tight">
            {name}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {role && <RolePill role={role} />}
            {email && email !== name && (
              <div className="text-[11px] text-slate-400 truncate">{email}</div>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void signOut(postSignOutUri())}
        className="mt-3 w-full inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-stone py-1.5 border border-stone/15 hover:border-amber transition-colors"
      >
        <ArrowRightOnRectangleIcon className="h-3.5 w-3.5" />
        Sign out
      </button>
    </div>
  );
}

function RolePill({ role }: { role: "owner" | "admin" | "member" }) {
  const cls: Record<typeof role, string> = {
    owner: "bg-amber/25 text-amber",
    admin: "bg-white/10 text-stone",
    member: "bg-white/5 text-slate-400",
  };
  return (
    <span
      className={cn(
        "inline-block text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5",
        cls[role],
      )}
    >
      {role}
    </span>
  );
}

function computeInitials(name: string, email: string | null): string {
  const source = name || email || "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
