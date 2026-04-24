import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useLogto } from "@logto/react";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { callbackUri } from "@/lib/auth";

export const Route = createFileRoute("/_authed")({
  component: AuthedLayout,
});

// Module-level so it survives StrictMode's double-effect invocation and
// route-change remounts. A full page navigation (which signIn() triggers)
// reloads the module and resets this flag naturally.
let signInTriggered = false;

function AuthedLayout() {
  // The official Logto React pattern: trust isLoading + isAuthenticated.
  // LogtoProvider starts with isLoading=true (see @logto/react provider
  // source — loadingCount initialises to 1) so the effect below won't
  // fire until the SDK has definitively resolved the session.
  const { isAuthenticated, isLoading, signIn } = useLogto();

  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    if (signInTriggered) return;
    signInTriggered = true;
    void signIn(callbackUri());
    // `signIn` is NOT in deps on purpose — @logto/react returns a fresh
    // reference each render and including it re-fires the effect in a
    // loop. The two primitive flags are what actually matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoading]);

  if (isLoading || !isAuthenticated) {
    // Visually identical to the inline splash in index.html so the
    // HTML splash → React splash transition is invisible.
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
