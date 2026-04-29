/**
 * Public landing page at `/`.
 *
 * Single-page Cambridge brand splash with two CTAs: Sign in (kicks the
 * Logto OAuth flow) and Request access (opens an in-app modal that POSTs
 * to /api/access-requests — admins see the queue on the Team page).
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLogto } from "@logto/react";
import { useEffect, useState } from "react";
import { ArrowRightIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import { callbackUri } from "@/lib/auth";
import { RequestAccessModal } from "@/components/auth/RequestAccessModal";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { isAuthenticated, isLoading, signIn } = useLogto();
  const navigate = useNavigate();
  // Local state so the button only disables when WE actually fired the
  // sign-in — useLogto().isLoading flips for every Logto SDK call (incl.
  // background token refreshes), which would grey the button out spuriously.
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  // Already signed in? Skip the marketing page entirely.
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      void navigate({ to: "/invoices", replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleSignIn = async () => {
    setSignInError(null);
    setSigningIn(true);
    try {
      // signIn() does window.location.assign internally — if it returns at
      // all without redirecting, something went wrong (most often a misconfig
      // in VITE_LOGTO_APP_ID / VITE_LOGTO_RESOURCE / VITE_LOGTO_ENDPOINT).
      await signIn(callbackUri());
    } catch (err) {
      console.error("signIn failed:", err);
      setSigningIn(false);
      setSignInError(
        err instanceof Error
          ? err.message
          : "We couldn't start sign-in. Try again, or ask an admin.",
      );
    }
  };

  // Don't flash the landing for a signed-in user during the redirect
  if (isAuthenticated) return null;

  return (
    <div className="fixed inset-0 overflow-hidden bg-stone bg-grid">
      {/* Brand mark in the corner */}
      <div className="absolute top-6 left-8 flex items-baseline gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber">
          Cambridge
        </span>
        <span className="font-display text-base text-navy leading-none">
          Invoice Portal
        </span>
      </div>

      <main className="absolute inset-0 flex items-center justify-center px-6">
        <div className="max-w-2xl w-full">
          <div className="border-l-2 border-amber pl-6 md:pl-8">
            <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber mb-3">
              Internal · For the Cambridge AP team
            </div>
            <h1 className="font-display text-5xl md:text-7xl text-navy leading-[1.05] tracking-tight">
              Invoice
              <br />
              <span className="text-amber">Portal</span>
            </h1>
            <p className="mt-6 text-base md:text-lg text-graphite/85 leading-relaxed max-w-xl">
              The internal AP system for Cambridge Building Group. Vendor
              invoices arrive by email or upload, get tagged to the right
              project, and post to QuickBooks once a PM approves them.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
              <button
                type="button"
                onClick={handleSignIn}
                disabled={signingIn}
                className="inline-flex items-center justify-center gap-2 bg-amber text-navy font-semibold px-6 py-3 text-sm tracking-wide transition-all hover:bg-amber/90 hover:translate-y-[-1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-wait"
              >
                {signingIn ? (
                  <span
                    aria-hidden
                    className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-r-transparent animate-spin"
                  />
                ) : null}
                {signingIn ? "Redirecting…" : "Sign in"}
                {!signingIn && <ArrowRightIcon className="h-4 w-4" aria-hidden />}
              </button>
              <button
                type="button"
                onClick={() => setRequestOpen(true)}
                className="inline-flex items-center justify-center gap-2 bg-transparent text-navy border-2 border-navy font-semibold px-6 py-3 text-sm tracking-wide transition-colors hover:bg-navy hover:text-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
              >
                <EnvelopeIcon className="h-4 w-4" aria-hidden />
                Request access
              </button>
            </div>

            {signInError && (
              <div
                role="alert"
                className="mt-6 max-w-md text-sm text-red-800 bg-red-50 border-l-2 border-red-700 px-3 py-2"
              >
                {signInError}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="absolute bottom-6 left-8 right-8 flex items-center justify-between text-[11px] uppercase tracking-widest text-graphite/50">
        <span>© {new Date().getFullYear()} Cambridge Building Group</span>
        <span className="hidden sm:inline">
          Accounts Payable · Invoice Portal
        </span>
      </footer>

      <RequestAccessModal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
      />
    </div>
  );
}
