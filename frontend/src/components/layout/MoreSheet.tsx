/**
 * Bottom sheet that opens when the user taps the "More" tab on mobile.
 * Lists secondary destinations (Audit, Settings), the account card, and a
 * sign-out action.
 *
 * Click outside / Esc / route change / link tap closes the sheet (the
 * AppShell controls the open state and calls onClose accordingly).
 */
import { Link, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLogto } from "@logto/react";
import {
  ArrowRightOnRectangleIcon,
  ClockIcon,
  Cog6ToothIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/cn";
import { postSignOutUri, useUser } from "@/lib/auth";
import { useMe } from "@/lib/users";

interface MoreLink {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  description?: string;
}

const MORE_LINKS: MoreLink[] = [
  {
    to: "/audit",
    label: "Audit log",
    Icon: ClockIcon,
    description: "Every change, by every user, time-stamped.",
  },
  {
    to: "/settings",
    label: "Settings",
    Icon: Cog6ToothIcon,
    description: "QuickBooks connection and sync preferences.",
  },
];

export function MoreSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { pathname } = useLocation();
  const user = useUser();
  const me = useMe();
  const { signOut } = useLogto();

  // Close automatically when route changes (e.g. after tapping a link inside
  // the sheet — the route navigation triggers this effect).
  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Body-scroll lock while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const role = me.data?.role ?? null;
  const name = user?.name?.trim() || user?.email || "Signed in";
  const email = user?.email ?? null;
  const initials = computeInitials(name, email);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="md:hidden fixed inset-0 z-40 flex flex-col justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute inset-0 bg-graphite/40"
          />

          {/* Sheet */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="More"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative bg-stone border-t-4 border-amber max-h-[85vh] overflow-y-auto"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Drag affordance */}
            <div className="pt-2 flex items-center justify-center">
              <span className="block h-1 w-10 bg-slate-300" />
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute top-3 right-3 p-2 text-slate-500 hover:text-navy"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>

            <div className="px-5 pt-4 pb-6">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber">
                More
              </div>
              <div className="font-display text-xl text-navy mt-0.5">
                Account &amp; tools
              </div>

              {/* Account card */}
              <div className="mt-5 bg-white p-4 border-l-2 border-amber flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex-shrink-0 inline-flex items-center justify-center h-11 w-11 bg-navy text-stone text-sm font-bold tracking-wider"
                >
                  {initials}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-graphite truncate">
                    {name}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 min-w-0">
                    {role && <RolePill role={role} />}
                    {email && email !== name && (
                      <div className="text-xs text-slate-500 truncate">
                        {email}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Secondary destinations */}
              <ul className="mt-4 bg-white divide-y divide-stone/60 border-l-2 border-amber/40">
                {MORE_LINKS.map(({ to, label, Icon, description }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      onClick={onClose}
                      className="flex items-center gap-3 px-4 py-3 min-h-[56px] hover:bg-amber/5 transition-colors"
                    >
                      <Icon
                        className="h-5 w-5 text-slate-500 flex-shrink-0"
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-graphite">
                          {label}
                        </div>
                        {description && (
                          <div className="text-xs text-slate-500 leading-snug mt-0.5">
                            {description}
                          </div>
                        )}
                      </div>
                      <span
                        aria-hidden
                        className="text-slate-300 text-xl leading-none"
                      >
                        ›
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              {/* Sign out */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  void signOut(postSignOutUri());
                }}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 min-h-[44px] bg-navy text-stone font-semibold text-sm tracking-wide hover:bg-navy/90 transition-colors px-4 py-3"
              >
                <ArrowRightOnRectangleIcon className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RolePill({ role }: { role: "owner" | "admin" | "member" }) {
  const cls: Record<typeof role, string> = {
    owner: "bg-amber/25 text-navy",
    admin: "bg-navy text-stone",
    member: "bg-slate-100 text-slate-700",
  };
  return (
    <span
      className={cn(
        "inline-block text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 flex-shrink-0",
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
