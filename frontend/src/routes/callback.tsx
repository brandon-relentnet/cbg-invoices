import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useHandleSignInCallback } from "@logto/react";
import { useEffect } from "react";

export const Route = createFileRoute("/callback")({
  component: Callback,
});

function Callback() {
  const navigate = useNavigate();
  const { isLoading } = useHandleSignInCallback(() => {
    void navigate({ to: "/invoices", replace: true });
  });

  useEffect(() => {
    // If Logto throws or is already handled, fall back after a moment
    const t = setTimeout(() => {
      if (!isLoading) void navigate({ to: "/invoices", replace: true });
    }, 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-stone">
      <div className="text-center">
        <div
          aria-hidden
          className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-navy border-r-transparent"
        />
        <p className="mt-3 text-sm text-slate-600">Completing sign-in…</p>
      </div>
    </div>
  );
}
