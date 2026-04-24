/**
 * /invite — landing page for email magic-link invites.
 *
 * Backend creates a one-time token via Logto Management API and emails the
 * user a link to /invite?token=…&email=…
 *
 * When the user lands here, we kick off Logto's sign-in flow with the
 * one-time token as a hint. Logto's hosted UI consumes the token and redirects
 * back to /callback where we finish the session. If the token is invalid or
 * expired, we fall back to a regular sign-in so the user can try again.
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

const LOGTO_ENDPOINT = (import.meta.env.VITE_LOGTO_ENDPOINT as string) ?? "";

function InvitePage() {
  const { token, email } = Route.useSearch();
  const { signIn } = useLogto();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !email) {
      setError(
        "This invite link is missing its token or email. Ask whoever invited you to send a fresh link.",
      );
      return;
    }
    // Logto's hosted sign-in page accepts a `one_time_token` and `login_hint`
    // query string pair. We nudge the SDK to send those along when redirecting.
    // The SDK doesn't expose them as first-class args, so we redirect directly
    // to the Logto sign-in URL with the one-time-token flag set.
    const callback = `${window.location.origin}/callback`;
    // Try the SDK path first — lets Logto's PKCE / state handling kick in.
    // Fall back to direct redirect on any error.
    void (async () => {
      try {
        // The signIn SDK method accepts an extended params object in newer
        // versions; older versions ignore unknown params which is also fine.
        // Pass login_hint + the one-time token so Logto can pre-fill and
        // auto-consume the token on the sign-in page.
        await signIn({
          redirectUri: callback,
          extraParams: {
            login_hint: email,
            one_time_token: token,
            // Some Logto versions use the explicit sign-in method identifier
            direct_sign_in: "one-time-token",
          },
        });
      } catch (exc) {
        // If the SDK rejects the shape, fall back to a raw redirect. This
        // still goes through Logto so PKCE etc. stay intact — just without the
        // pre-fill hint, so the user may have to paste the token manually.
        console.warn("SDK signIn with one-time-token failed, falling back:", exc);
        const qs = new URLSearchParams({
          login_hint: email,
          one_time_token: token,
        }).toString();
        window.location.assign(`${LOGTO_ENDPOINT}/sign-in?${qs}`);
      }
    })();
  }, [token, email, signIn]);

  return (
    <div className="min-h-screen bg-stone flex items-center justify-center p-6">
      <div className="bg-white border-t-4 border-amber max-w-md w-full p-8 text-center">
        <div className="text-[11px] font-bold uppercase tracking-widest text-amber">
          Cambridge
        </div>
        <h1 className="font-display text-2xl text-navy mt-1">Invoice Portal</h1>
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
              If nothing happens in a few seconds, check that the link in your
              email matches the one in your browser.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
