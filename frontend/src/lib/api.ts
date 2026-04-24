/**
 * Thin fetch wrapper that attaches the Logto access token and handles errors.
 * Use via useApi() hook inside React Query queries.
 */
import { useCallback } from "react";
import { useLogto } from "@logto/react";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) ?? "http://localhost:8000";
const RESOURCE = import.meta.env.VITE_LOGTO_RESOURCE as string;

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
  const { getAccessToken } = useLogto();

  const request = useCallback(
    async <T,>(path: string, options: ApiOptions = {}): Promise<T> => {
      const token = await getAccessToken(RESOURCE);
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
        const msg =
          (parsed as { detail?: string } | null)?.detail ?? `Request failed (${res.status})`;
        throw new ApiError(msg, res.status, parsed);
      }

      if (res.status === 204) return undefined as T;
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) return (await res.text()) as T;
      return (await res.json()) as T;
    },
    [getAccessToken],
  );

  return { request };
}
