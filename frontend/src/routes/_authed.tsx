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
  // @logto/react wraps every SDK method (getAccessToken, getIdTokenClaims,
  // signOut, etc.) in a proxy that toggles its internal `isLoading` state
  // for the duration of the call. Every Logto call you make — even after
  // successful authentication — briefly flips `isLoading` to true. That's
  // fine for a spinner button, but means we CANNOT gate the mounting of
  // the app shell on `isLoading`, or TopBar's useUser() → getIdTokenClaims()
  // → isLoading flip → shell unmounts → TopBar remounts → getIdTokenClaims()
  // again → infinite loop.
  //
  // Only gate on `isAuthenticated`. The initial session restore holds
  // `isAuthenticated` false AND `isLoading` true until the check finishes.
  const { isAuthenticated, isLoading, signIn } = useLogto();

  useEffect(() => {
    // Only redirect when Logto has definitively resolved the session
    // (isLoading=false) AND the user isn't signed in.
    if (isLoading || isAuthenticated) return;
    if (signInTriggered) return;
    signInTriggered = true;
    void signIn(callbackUri());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoading]);

  if (!isAuthenticated) {
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
