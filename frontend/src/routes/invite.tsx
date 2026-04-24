/**
 * /invite — landing page for email magic-link invites.
 *
 * Backend mints a one-time token via Logto's Management API and emails the
 * user a link to /invite?token=…&email=…
 *
 * Flow:
 *   1. If the recipient is already signed in (typically the inviter testing
 *      their own invite link), force-sign them out first — otherwise Logto
 *      sees an existing session and skips the OTT flow.
 *   2. Otherwise, call signIn() with the documented one-time-token params.
 *      Logto's experience UI auto-detects the params and consumes the token,
 *      then redirects back to /callback.
 *   3. After /callback finishes, the main app's PasswordSetupModal kicks in
 *      (because the new user has needs_password=true in their custom data).
 *
 * Prerequisite — Logto admin console:
 *   Console → Sign-in experience → Sign-up and sign-in
 *     - Sign-up identifier: Email
 *     - Sign-up password: NOT required
 *     - Sign-in: Email + Verification code enabled
 *
 * Docs: https://docs.logto.io/end-user-flows/one-time-token
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useLogto } from "@logto/react";
import { callbackUri } from "@/lib/auth";

export const Route = createFileRoute("/invite")({
  component: InvitePage,
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
    email: typeof search.email === "string" ? search.email : "",
  }),
});

// Module-level guards — survive React StrictMode's double-effect invocation.
// Cleared on full-page navigation (which signIn/signOut both perform).
let signInTriggered = false;
let signOutTriggered = false;

function InvitePage() {
  const { token, email } = Route.useSearch();
  const { signIn, signOut, isAuthenticated, isLoading } = useLogto();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for Logto to resolve the session
    if (isLoading) return;

    if (!token || !email) {
      setError(
        "This invite link is missing its token or email. Ask whoever invited you to send a fresh link.",
      );
      return;
    }

    // If already signed in, sign out first so Logto sees a clean session
    // and runs the OTT flow for the *invited* user. Returning to the same
    // /invite URL preserves the token + email in the query string.
    if (isAuthenticated) {
      if (signOutTriggered) return;
      signOutTriggered = true;
      void signOut(window.location.href);
      return;
    }

    if (signInTriggered) return;
    signInTriggered = true;

    // The Logto Browser SDK exposes `loginHint` as a first-class option;
    // putting `login_hint` in `extraParams` separately would result in the
    // param appearing twice on the /oidc/auth URL. Keep one_time_token in
    // extraParams (no first-class field for it).
    void signIn({
      redirectUri: callbackUri(),
      loginHint: email,
      firstScreen: "sign-in",
      extraParams: {
        one_time_token: token,
      },
    }).catch((exc) => {
      signInTriggered = false;
      console.error("Magic-link sign-in failed:", exc);
      setError(
        "We couldn't start the sign-in flow with this link. Try requesting a fresh invite.",
      );
    });
  }, [token, email, signIn, signOut, isAuthenticated, isLoading]);

  return (
    <Frame>
      {error ? (
        <div className="mt-6 text-sm text-red-700">{error}</div>
      ) : (
        <>
          <div className="mt-8">
            <div
              aria-hidden
              className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-navy border-r-transparent"
            />
          </div>
          <p className="mt-3 text-sm text-slate-600">
            {isAuthenticated
              ? "Signing you out so we can redeem your invite link…"
              : "Signing you in with your invite link…"}
          </p>
        </>
      )}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone flex items-center justify-center p-6">
      <div className="bg-white border-t-4 border-amber max-w-md w-full p-8 text-center">
        <div className="text-[11px] font-bold uppercase tracking-widest text-amber">
          Cambridge
        </div>
        <h1 className="font-display text-2xl text-navy mt-1">Invoice Portal</h1>
        {children}
      </div>
    </div>
  );
}
