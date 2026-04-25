/**
 * Access-request hooks.
 *
 * - useSubmitAccessRequest: PUBLIC, used by the landing-page modal.
 *   Doesn't go through useApi() (no auth needed) — uses fetch directly so it
 *   works for unauthenticated visitors.
 *
 * - useAccessRequests / useApprove / useDismiss: ADMIN, used by the Team page.
 *   Goes through the authenticated useApi() helper.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi, ApiError } from "./api";
import { qk } from "./queryKeys";
import type { AccessRequest, AccessRequestListResponse } from "@/types";

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string) ?? "http://localhost:8000";

// ──────────────────────────────────────────────────────────────────────────
// Public submission (no auth)
// ──────────────────────────────────────────────────────────────────────────

export interface AccessRequestInput {
  email: string;
  name?: string;
  message?: string;
}

export function useSubmitAccessRequest() {
  return useMutation({
    mutationFn: async (input: AccessRequestInput): Promise<AccessRequest> => {
      const res = await fetch(`${BASE_URL}/api/access-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        let parsed: unknown = null;
        try {
          parsed = await res.json();
        } catch {
          // ignore
        }
        const msg =
          (parsed as { detail?: string } | null)?.detail ??
          `Request failed (${res.status})`;
        throw new ApiError(msg, res.status, parsed);
      }
      return (await res.json()) as AccessRequest;
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Admin queue
// ──────────────────────────────────────────────────────────────────────────

export function useAccessRequests(opts: { enabled?: boolean } = {}) {
  const { request } = useApi();
  return useQuery({
    queryKey: qk.accessRequests.list(),
    queryFn: () =>
      request<AccessRequestListResponse>("/api/access-requests"),
    enabled: opts.enabled ?? true,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
}

export function useApproveAccessRequest() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<AccessRequest>(`/api/access-requests/${id}/approve`, {
        method: "POST",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.accessRequests.root() });
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useDismissAccessRequest() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<AccessRequest>(`/api/access-requests/${id}/dismiss`, {
        method: "POST",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.accessRequests.root() });
    },
  });
}
