/**
 * Thin fetch wrapper that attaches the Logto access token and handles errors.
 * Use via useApi() hook inside React Query queries.
 */
import { useCallback } from "react";
import { LogtoClientError, LogtoError, useLogto } from "@logto/react";
import { postSignOutUri } from "@/lib/auth";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) ?? "http://localhost:8000";
const RESOURCE = import.meta.env.VITE_LOGTO_RESOURCE as string;

// Module-level so concurrent requests trigger at most one sign-out redirect.
// A full page navigation (which signOut() causes) resets it naturally.
let staleSessionSignOutTriggered = false;

/**
 * Is this getAccessToken failure proof the session is unrecoverable?
 *
 * Only two shapes qualify:
 *  - LogtoClientError (e.g. `not_authenticated`) — no usable sign-in session.
 *  - LogtoError whose OIDC payload is `invalid_grant` — the refresh token is
 *    dead or was rotated away (the long-lived phone-session case).
 *
 * Everything else — `TypeError: Failed to fetch` while a phone's radio
 * reconnects, a Logto restart, a proxy 5xx — is transient: the next poll
 * will succeed, so it must surface as a failed request, never a sign-out.
 */
function isDefinitiveAuthFailure(e: unknown): boolean {
  if (e instanceof LogtoClientError) return true;
  if (e instanceof LogtoError) {
    const oidcError = (e.data as { error?: string } | undefined)?.error;
    return oidcError === "invalid_grant";
  }
  return false;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiOptions extends RequestInit {
  // For file uploads. Overrides body/headers handling.
  formData?: FormData;
}

export function useApi() {
  const { getAccessToken, isAuthenticated, signOut } = useLogto();

  const request = useCallback(
    async <T,>(path: string, options: ApiOptions = {}): Promise<T> => {
      // Stale session: Logto still reports authenticated but can no longer
      // mint an access token (expired/rotated refresh token — long-lived
      // phone sessions hit this). Without this, every request would go out
      // unauthenticated and surface as confusing 401s ("Missing bearer
      // token") all over the UI. Sign out fully; the auth gate then routes
      // to a fresh login.
      const staleSessionBailout = (): never => {
        if (!staleSessionSignOutTriggered) {
          staleSessionSignOutTriggered = true;
          void signOut(postSignOutUri());
        }
        throw new ApiError("Your session expired — sending you back to sign in…", 401, null);
      };

      let token: string | undefined;
      try {
        token = (await getAccessToken(RESOURCE)) ?? undefined;
      } catch (e) {
        if (isAuthenticated && isDefinitiveAuthFailure(e)) staleSessionBailout();
        // Transient failure (network blip, Logto momentarily unreachable):
        // rethrow as a normal request failure so react-query's retry/poll
        // machinery absorbs it. Signing out here would log people out on
        // flaky connections — the exact users the stale-session fix is for.
        throw e instanceof Error ? e : new Error(String(e));
      }
      if (!token && isAuthenticated) staleSessionBailout();
      const headers: HeadersInit = {
        ...(options.headers ?? {}),
      };
      if (token) (headers as Record<string, string>).Authorization = `Bearer ${token}`;

      let body: BodyInit | undefined = options.body ?? undefined;
      if (options.formData) {
        body = options.formData;
      } else if (options.body && typeof options.body === "object" && !(options.body instanceof FormData)) {
        (headers as Record<string, string>)["Content-Type"] = "application/json";
        body = JSON.stringify(options.body);
      }

      const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
      const res = await fetch(url, {
        ...options,
        body,
        headers,
      });

      if (!res.ok) {
        let parsed: unknown = null;
        try {
          parsed = await res.json();
        } catch {
          // ignore
        }
        if (res.status === 401 && token && !staleSessionSignOutTriggered) {
          // We sent a token and the backend rejected it — the session is no
          // longer valid. Same recovery as the missing-token case above.
          staleSessionSignOutTriggered = true;
          void signOut(postSignOutUri());
        }
        const msg =
          (parsed as { detail?: string } | null)?.detail ?? `Request failed (${res.status})`;
        throw new ApiError(msg, res.status, parsed);
      }

      if (res.status === 204) return undefined as T;
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) return (await res.text()) as T;
      return (await res.json()) as T;
    },
    [getAccessToken, isAuthenticated, signOut],
  );

  return { request };
}
