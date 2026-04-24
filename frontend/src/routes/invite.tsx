/**
 * /invite — landing page for email magic-link invites.
 *
 * Backend mints a one-time token via Logto's Management API and emails the
 * user a link to /invite?token=…&email=…
 *
 * When the user lands here we call the Logto SDK's signIn() with the
 * documented `one_time_token` + `login_hint` extraParams. Logto's hosted
 * sign-in page auto-consumes the token and redirects back to /callback to
 * finish the session — no password, no passcode prompt.
 *
 * Prerequisite (configured in the Logto admin console):
 *   Console → Sign-in experience → Sign-up and sign-in
 *     - Under "Sign-in", enable the "Email" identifier.
 *     - Under "Sign-in methods", include "Email" with the "Verification code"
 *       method enabled.
 *   Without these, Logto won't recognize the one-time-token hint and will
 *   fall back to the normal sign-in screen.
 *
 * Docs: https://docs.logto.io/end-user-flows/one-time-token
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useLogto } from "@logto/react";

export const Route = createFileRoute("/invite")({
  component: InvitePage,
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
    email: typeof search.email === "string" ? search.email : "",
  }),
});

// Module-level flag so React StrictMode's double mount doesn't kick off two
// parallel sign-in redirects (the second one wins, overwriting PKCE state).
let signInTriggered = false;

function InvitePage() {
  const { token, email } = Route.useSearch();
  const { signIn, isAuthenticated } = useLogto();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (signInTriggered) return;

    if (!token || !email) {
      setError(
        "This invite link is missing its token or email. Ask whoever invited you to send a fresh link.",
      );
      return;
    }

    // If the recipient is already signed in as someone else, we want Logto to
    // swap sessions — pass clearTokens: false per the docs so PKCE state
    // flows through correctly and the one-time token drives the new session.
    signInTriggered = true;
    const redirectUri = `${window.location.origin}/callback`;
    void signIn({
      redirectUri,
      clearTokens: false,
      extraParams: {
        one_time_token: token,
        login_hint: email,
      },
    }).catch((exc) => {
      signInTriggered = false;
      console.error("Magic-link sign-in failed:", exc);
      setError(
        "We couldn't start the sign-in flow with this link. Try requesting a fresh invite.",
      );
    });
  }, [token, email, signIn]);

  // Already signed in? Offer a quick path forward instead of silently
  // swapping sessions.
  if (isAuthenticated && !signInTriggered && !error) {
    return (
      <Frame>
        <p className="mt-6 text-sm text-graphite">
          You're already signed in. Head back to the{" "}
          <a
            href="/invoices"
            className="font-semibold text-navy underline hover:text-amber"
          >
            invoice queue
          </a>
          , or sign out first to redeem this invite link for a different
          account.
        </p>
      </Frame>
    );
  }

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
            Signing you in with your invite link…
          </p>
          <p className="mt-1 text-xs text-slate-500">
            If this takes more than a few seconds, you may need to ask your
            admin to enable Email sign-in in Logto.
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
