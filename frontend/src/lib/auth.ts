/**
 * Thin helpers on top of @logto/react.
 *
 * We intentionally don't wrap `useLogto` in a broader context. Per Logto's
 * official React SDK docs, components should call `useLogto` directly and
 * rely on its built-in `isAuthenticated` / `isLoading` state. Wrappers were
 * causing re-render churn and redirect loops on page refresh.
 *
 * See: https://docs.logto.io/quick-starts/react
 */
import { useLogto } from "@logto/react";
import { useEffect, useState } from "react";
import type { CurrentUser } from "@/types";

/**
 * Load the current user's id-token claims. Returns `null` while loading
 * or when the user is unauthenticated.
 */
export function useUser(): CurrentUser | null {
  const { isAuthenticated, getIdTokenClaims } = useLogto();
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setUser(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const claims = await getIdTokenClaims();
        if (cancelled || !claims) return;
        setUser({
          id: claims.sub,
          email: (claims.email as string | undefined) ?? null,
          name:
            (claims.name as string | undefined) ??
            (claims.username as string | undefined) ??
            null,
        });
      } catch {
        if (!cancelled) setUser(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only depend on the primitive `isAuthenticated`. `getIdTokenClaims` is
    // a fresh reference each render but is stable in behaviour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  return user;
}

/** Redirect target used by both signIn() and the signed-out fallback. */
export function callbackUri(): string {
  return `${window.location.origin}/callback`;
}

/** Home URI to return to after sign-out. */
export function postSignOutUri(): string {
  return window.location.origin;
}
