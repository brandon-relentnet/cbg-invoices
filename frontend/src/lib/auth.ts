/**
 * Thin wrapper over @logto/react — gets populated in phase 3.
 * Exported as a stable hook surface so components don't change later.
 */
import { useLogto } from "@logto/react";
import { useEffect, useState } from "react";
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
  const logto = useLogto();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const resource = import.meta.env.VITE_LOGTO_RESOURCE as string;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!logto.isAuthenticated) {
        setUser(null);
        return;
      }
      try {
        const claims = await logto.getIdTokenClaims();
        if (cancelled) return;
        setUser({
          id: claims.sub,
          email: claims.email ?? null,
          name: claims.name ?? claims.username ?? null,
        });
      } catch {
        if (!cancelled) setUser(null);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [logto.isAuthenticated, logto]);

  return {
    isAuthenticated: logto.isAuthenticated,
    isLoading: logto.isLoading,
    user,
    getAccessToken: () => logto.getAccessToken(resource),
    signIn: () =>
      logto.signIn(`${window.location.origin}/callback`),
    signOut: () => logto.signOut(window.location.origin),
  };
}
