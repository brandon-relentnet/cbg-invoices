/**
 * Bottom tab bar — primary navigation on mobile (<md only).
 *
 * Five slots:
 *   1. Invoices  · DocumentTextIcon
 *   2. Vendors   · BuildingOffice2Icon
 *   3. Projects  · FolderIcon
 *   4. Team      · UsersIcon (with pending-access-request badge for admins)
 *   5. More      · EllipsisHorizontalIcon — opens the MoreSheet (Audit,
 *                  Settings, Account, Sign out)
 *
 * Active tab gets an amber top border, amber filled icon, navy label.
 * Inactive tabs get slate icon + muted label.
 */
import { Link, useLocation } from "@tanstack/react-router";
import {
  BuildingOffice2Icon,
  DocumentTextIcon,
  EllipsisHorizontalCircleIcon,
  FolderIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import {
  BuildingOffice2Icon as BuildingOffice2Solid,
  DocumentTextIcon as DocumentTextSolid,
  EllipsisHorizontalCircleIcon as EllipsisSolid,
  FolderIcon as FolderSolid,
  UsersIcon as UsersSolid,
} from "@heroicons/react/24/solid";
import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/cn";
import { useMe } from "@/lib/users";
import { useAccessRequests } from "@/lib/accessRequests";

interface NavTab {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  IconActive: ComponentType<SVGProps<SVGSVGElement>>;
  matches: (pathname: string) => boolean;
}

const NAV_TABS: NavTab[] = [
  {
    to: "/invoices",
    label: "Invoices",
    Icon: DocumentTextIcon,
    IconActive: DocumentTextSolid,
    // Includes /invoices and /invoices/$id
    matches: (p) => p === "/invoices" || p.startsWith("/invoices/"),
  },
  {
    to: "/vendors",
    label: "Vendors",
    Icon: BuildingOffice2Icon,
    IconActive: BuildingOffice2Solid,
    matches: (p) => p.startsWith("/vendors"),
  },
  {
    to: "/projects",
    label: "Projects",
    Icon: FolderIcon,
    IconActive: FolderSolid,
    matches: (p) => p.startsWith("/projects"),
  },
  {
    to: "/team",
    label: "Team",
    Icon: UsersIcon,
    IconActive: UsersSolid,
    matches: (p) => p.startsWith("/team"),
  },
];

const SECONDARY_PATHS = ["/audit", "/settings"];

export function BottomTabBar({
  moreOpen,
  onOpenMore,
}: {
  moreOpen: boolean;
  onOpenMore: () => void;
}) {
  const { pathname } = useLocation();
  const me = useMe();
  const canManage = me.data?.role === "owner" || me.data?.role === "admin";
  const reqQuery = useAccessRequests({ enabled: canManage });
  const pendingCount = reqQuery.data?.pending_count ?? 0;

  const moreActive =
    moreOpen || SECONDARY_PATHS.some((p) => pathname.startsWith(p));

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 h-16 bg-white border-t border-stone/80 flex items-stretch justify-around"
      // Add safe-area inset for iPhones with home indicators
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      {NAV_TABS.map((tab) => {
        const active = tab.matches(pathname);
        const Icon = active ? tab.IconActive : tab.Icon;
        const showBadge = tab.to === "/team" && pendingCount > 0;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 relative",
              "min-h-[44px] py-1",
              active && "border-t-2 border-amber -mt-px",
            )}
            aria-current={active ? "page" : undefined}
          >
            <span className="relative">
              <Icon
                className={cn(
                  "h-6 w-6 transition-colors",
                  active ? "text-amber" : "text-slate-500",
                )}
                aria-hidden
              />
              {showBadge && (
                <span
                  aria-label={`${pendingCount} pending`}
                  className="absolute -top-1 -right-2 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 bg-amber text-navy text-[10px] font-bold tracking-tight"
                >
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              )}
            </span>
            <span
              className={cn(
                "text-[10px] font-semibold tracking-wide uppercase",
                active ? "text-navy" : "text-slate-500",
              )}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}

      {/* "More" — opens a sheet with the secondary destinations */}
      <button
        type="button"
        onClick={onOpenMore}
        aria-pressed={moreActive}
        className={cn(
          "flex-1 flex flex-col items-center justify-center gap-0.5 relative",
          "min-h-[44px] py-1",
          moreActive && "border-t-2 border-amber -mt-px",
        )}
      >
        {moreActive ? (
          <EllipsisSolid className="h-6 w-6 text-amber" aria-hidden />
        ) : (
          <EllipsisHorizontalCircleIcon
            className="h-6 w-6 text-slate-500"
            aria-hidden
          />
        )}
        <span
          className={cn(
            "text-[10px] font-semibold tracking-wide uppercase",
            moreActive ? "text-navy" : "text-slate-500",
          )}
        >
          More
        </span>
      </button>
    </nav>
  );
}
