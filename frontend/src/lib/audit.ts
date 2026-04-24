import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import type { AuditLogEntry } from "@/types";

export interface AuditListParams {
  invoice_id?: string;
  actor_id?: string;
  action?: string;
  page?: number;
  page_size?: number;
}

export interface AuditListResponse {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
}

function toQuery(p: AuditListParams): string {
  const sp = new URLSearchParams();
  if (p.invoice_id) sp.set("invoice_id", p.invoice_id);
  if (p.actor_id) sp.set("actor_id", p.actor_id);
  if (p.action) sp.set("action", p.action);
  if (p.page) sp.set("page", String(p.page));
  if (p.page_size) sp.set("page_size", String(p.page_size));
  return sp.toString();
}

export function useAuditLog(params: AuditListParams) {
  const { request } = useApi();
  return useQuery({
    queryKey: qk.audit.list(params),
    queryFn: () => {
      const q = toQuery(params);
      return request<AuditListResponse>(`/api/audit${q ? `?${q}` : ""}`);
    },
  });
}
