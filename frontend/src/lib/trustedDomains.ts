/**
 * React Query hooks for the trusted-sender-domain admin API.
 *
 * The list query is shared between the Settings page (full editor)
 * and the triage flows that invalidate it after "Trust sender +
 * promote" actions, so we use a stable queryKey: ``["trusted-domains"]``.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import type { TrustedDomainListResponse, TrustedDomain } from "@/types";


const KEY = ["trusted-domains"] as const;


export function useTrustedDomains(opts: { enabled?: boolean } = {}) {
  const { request } = useApi();
  return useQuery({
    queryKey: KEY,
    queryFn: () => request<TrustedDomainListResponse>("/api/trusted-domains"),
    enabled: opts.enabled ?? true,
    staleTime: 60_000,
  });
}


/** Add a domain manually. Server pulls the registrable form. */
export function useAddTrustedDomain() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { domain: string; notes?: string | null }) =>
      request<TrustedDomain>("/api/trusted-domains", {
        method: "POST",
        body: body as unknown as BodyInit,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}


/**
 * Remove a manual / promoted-from-triage entry. The server returns
 * 409 if the row's source is qbo_sync — those re-appear on every
 * vendor sync, so manual removal would be surprising. We surface
 * the server message verbatim in the Settings UI.
 */
export function useRemoveTrustedDomain() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<void>(`/api/trusted-domains/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
