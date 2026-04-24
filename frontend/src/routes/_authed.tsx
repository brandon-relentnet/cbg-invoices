import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";

export const Route = createFileRoute("/_authed")({
  component: AuthedLayout,
});

function AuthedLayout() {
  const { isAuthenticated, isLoading, signIn } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void signIn();
    }
  }, [isAuthenticated, isLoading, signIn]);

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
