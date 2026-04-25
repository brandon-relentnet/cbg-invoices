/**
 * Public landing page at `/`.
 *
 * Shown to unauthenticated visitors as a brief Cambridge-branded splash with
 * two CTAs: sign in (which jumps into the Logto flow), or request access
 * (mailto: an admin so they can be invited).
 *
 * Authenticated users immediately get bounced to /invoices — no point
 * showing a marketing page to someone already inside.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLogto } from "@logto/react";
import { useEffect } from "react";
import { ArrowRightIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import { callbackUri } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Landing,
});

// Configurable contact email for "Request access". Falls back to a sensible
// default if VITE_CONTACT_EMAIL isn't set at build time.
const CONTACT_EMAIL =
  (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) ??
  "invoices@cambridgebg.com";

function Landing() {
  const { isAuthenticated, isLoading, signIn } = useLogto();
  const navigate = useNavigate();

  // Already signed in? Skip the marketing page entirely.
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      void navigate({ to: "/invoices", replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleSignIn = () => {
    void signIn(callbackUri());
  };

  // Don't flash the landing for a signed-in user during the redirect.
  if (isAuthenticated) return null;

  return (
    <div className="fixed inset-0 overflow-hidden bg-stone bg-grid">
      {/* Brand mark in the corner — tiny, doesn't compete */}
      <div className="absolute top-6 left-8 flex items-baseline gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber">
          Cambridge
        </span>
        <span className="font-display text-base text-navy leading-none">
          Invoice Portal
        </span>
      </div>

      {/* Centered hero */}
      <main className="absolute inset-0 flex items-center justify-center px-6">
        <div className="max-w-2xl w-full">
          {/* Amber accent strip — quintessential Cambridge */}
          <div className="border-l-2 border-amber pl-6 md:pl-8">
            <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber mb-3">
              Cambridge Building Group · Internal
            </div>
            <h1 className="font-display text-5xl md:text-7xl text-navy leading-[1.05] tracking-tight">
              Invoice
              <br />
              <span className="text-amber">Portal.</span>
            </h1>
            <p className="mt-6 text-base md:text-lg text-graphite/85 leading-relaxed max-w-xl">
              Subcontractor invoices in. QuickBooks bills out. Reviewed,
              project-tagged, and audit-trailed by the Cambridge AP team.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isLoading}
                className="inline-flex items-center justify-center gap-2 bg-amber text-navy font-semibold px-6 py-3 text-sm tracking-wide transition-all hover:bg-amber/90 hover:translate-y-[-1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sign in
                <ArrowRightIcon className="h-4 w-4" aria-hidden />
              </button>
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Invoice Portal — Request access")}&body=${encodeURIComponent(REQUEST_ACCESS_BODY)}`}
                className="inline-flex items-center justify-center gap-2 bg-transparent text-navy border-2 border-navy font-semibold px-6 py-3 text-sm tracking-wide transition-colors hover:bg-navy hover:text-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
              >
                <EnvelopeIcon className="h-4 w-4" aria-hidden />
                Request access
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* Footer — minimal, single line */}
      <footer className="absolute bottom-6 left-8 right-8 flex items-center justify-between text-[11px] uppercase tracking-widest text-graphite/50">
        <span>© {new Date().getFullYear()} Cambridge Building Group</span>
        <span className="hidden sm:inline">Accounts Payable · Invoice Portal</span>
      </footer>
    </div>
  );
}

const REQUEST_ACCESS_BODY = `Hi,

I'd like access to the Cambridge Invoice Portal.

Name:
Role:
Why I need access:

Thanks!`;
