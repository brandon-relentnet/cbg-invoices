/**
 * Thin wrapper over @logto/react providing a stable hook surface.
 *
 * Important: only depend on PRIMITIVE fields from `useLogto()` (isAuthenticated,
 * isLoading) — the `logto` object itself can change reference between renders,
 * and depending on it in an effect triggers an infinite render loop.
 */
import { useLogto } from "@logto/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CurrentUser } from "@/types";

interface AuthAPI {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: CurrentUser | null;
  getAccessToken: () => Promise<string | undefined>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthAPI {
  const {
    isAuthenticated,
    isLoading,
    getIdTokenClaims,
    getAccessToken,
    signIn: logtoSignIn,
    signOut: logtoSignOut,
  } = useLogto();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const resource = import.meta.env.VITE_LOGTO_RESOURCE as string;

  // Load id-token claims into `user` only when auth state flips.
  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) {
      setUser(null);
      return;
    }
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
    // Intentionally only depend on isAuthenticated. getIdTokenClaims is a
    // fresh function on every render but is effectively stable for our needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const signIn = useCallback(
    () => logtoSignIn(`${window.location.origin}/callback`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const signOut = useCallback(
    () => logtoSignOut(window.location.origin),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const fetchToken = useCallback(
    () => getAccessToken(resource),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resource],
  );

  return useMemo<AuthAPI>(
    () => ({
      isAuthenticated,
      isLoading,
      user,
      getAccessToken: fetchToken,
      signIn,
      signOut,
    }),
    [isAuthenticated, isLoading, user, fetchToken, signIn, signOut],
  );
}
