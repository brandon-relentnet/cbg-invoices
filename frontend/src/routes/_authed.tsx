import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authed")({
  component: AuthedLayout,
});

function AuthedLayout() {
  const { isAuthenticated, isLoading, signIn } = useAuth();
  const redirecting = useRef(false);

  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    if (redirecting.current) return;
    redirecting.current = true;
    void signIn();
    // Only depend on the primitive flags — `signIn` is a fresh closure every
    // render and would retrigger the effect (infinite redirect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoading]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone">
        <div className="text-center">
          <div
            aria-hidden
            className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-navy border-r-transparent"
          />
          <p className="mt-3 text-sm text-slate-600">Signing you in…</p>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
