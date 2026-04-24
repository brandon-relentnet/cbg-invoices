import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authed")({
  component: AuthedLayout,
});

// Module-level flag — persists across component remounts (StrictMode's
// double-invoke, route changes) but resets on full page loads (which is
// what we want, since signIn() triggers a full-page redirect to Logto).
let signInTriggered = false;

// Grace period before we conclude the user really is signed out. When
// refreshing with an active session, the LogtoProvider briefly reports
// (isLoading=false, isAuthenticated=false) before it finishes restoring
// the session from localStorage. Without this delay, we'd kick off a
// redirect-to-Logto loop that produces a visible flash.
const AUTH_DECISION_DELAY_MS = 500;

function AuthedLayout() {
  const { isAuthenticated, isLoading, signIn } = useAuth();
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    // If Logto has already reported a definitive state, we don't need the delay
    if (isAuthenticated || isLoading) {
      setWaited(true);
      return;
    }
    // Otherwise wait a moment before trusting "not authenticated"
    const t = setTimeout(() => setWaited(true), AUTH_DECISION_DELAY_MS);
    return () => clearTimeout(t);
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (!waited) return;
    if (isLoading || isAuthenticated) return;
    if (signInTriggered) return;
    signInTriggered = true;
    void signIn();
    // Effect intentionally excludes `signIn` — its reference is stable
    // (memoized in useAuth) but keeping the dep would re-fire on unrelated
    // re-renders. See fix-commit for the infinite-loop rationale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waited, isAuthenticated, isLoading]);

  if (!waited || isLoading || !isAuthenticated) {
    // Visually identical to the splash screen in index.html so the
    // pre-hydration splash → post-hydration loader is a no-op transition.
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-stone">
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-amber">
          Cambridge
        </span>
        <span className="font-display text-[2rem] text-navy leading-none">
          Invoice Portal
        </span>
        <span
          aria-hidden
          className="h-5 w-5 animate-spin rounded-full border-2 border-navy border-r-transparent motion-reduce:animate-none"
        />
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
