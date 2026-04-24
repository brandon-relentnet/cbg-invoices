/**
 * Invoice-specific API calls and React Query hooks.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import type {
  Invoice,
  InvoiceListResponse,
  InvoiceStatus,
  LineItem,
  Project,
  Vendor,
} from "@/types";

export interface ListParams {
  status?: InvoiceStatus[];
  q?: string;
  page?: number;
  page_size?: number;
}

function toQuery(params: ListParams): string {
  const sp = new URLSearchParams();
  if (params.status) {
    for (const s of params.status) sp.append("status", s);
  }
  if (params.q) sp.set("q", params.q);
  if (params.page) sp.set("page", String(params.page));
  if (params.page_size) sp.set("page_size", String(params.page_size));
  return sp.toString();
}

export function useInvoices(params: ListParams) {
  const { request } = useApi();
  return useQuery({
    queryKey: qk.invoices.list(params),
    queryFn: () => {
      const query = toQuery(params);
      return request<InvoiceListResponse>(`/api/invoices${query ? `?${query}` : ""}`);
    },
    refetchInterval: 10_000, // poll for new inbound invoices / extraction progress
  });
}

export function useInvoice(id: string | undefined) {
  const { request } = useApi();
  return useQuery({
    queryKey: id ? qk.invoices.detail(id) : ["disabled"],
    queryFn: () => request<Invoice>(`/api/invoices/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data as Invoice | undefined;
      if (!data) return false;
      // Keep polling while extraction or QBO posting is in flight.
      // Stop once extraction_failed/ready_for_review/posted_to_qbo/rejected.
      if (data.status === "extracting" || data.status === "received") return 2000;
      if (data.status === "approved" && !data.qbo_post_error) return 2000;
      return false;
    },
  });
}

export function useUploadInvoice() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return request<Invoice>("/api/invoices", {
        method: "POST",
        formData: fd,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.invoices.root() });
    },
  });
}

export interface InvoicePatchPayload {
  vendor_name?: string | null;
  vendor_id?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  subtotal_cents?: number | null;
  tax_cents?: number | null;
  total_cents?: number | null;
  currency?: string;
  po_number?: string | null;
  notes?: string | null;
  line_items?: LineItem[];
  project_id?: string | null;
}

export function usePatchInvoice(id: string) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: InvoicePatchPayload) =>
      request<Invoice>(`/api/invoices/${id}`, {
        method: "PATCH",
        body: patch as unknown as BodyInit,
      }),
    onSuccess: (data) => {
      qc.setQueryData(qk.invoices.detail(id), data);
      void qc.invalidateQueries({ queryKey: qk.invoices.root() });
    },
  });
}

export function useApproveInvoice(id: string) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<Invoice>(`/api/invoices/${id}/approve`, { method: "POST" }),
    onSuccess: (data) => {
      qc.setQueryData(qk.invoices.detail(id), data);
      void qc.invalidateQueries({ queryKey: qk.invoices.root() });
    },
  });
}

export function useRejectInvoice(id: string) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      request<Invoice>(`/api/invoices/${id}/reject`, {
        method: "POST",
        body: { reason } as unknown as BodyInit,
      }),
    onSuccess: (data) => {
      qc.setQueryData(qk.invoices.detail(id), data);
      void qc.invalidateQueries({ queryKey: qk.invoices.root() });
    },
  });
}

export function useReextractInvoice(id: string) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request<Invoice>(`/api/invoices/${id}/reextract`, { method: "POST" }),
    onSuccess: (data) => {
      qc.setQueryData(qk.invoices.detail(id), data);
    },
  });
}

export function useRetryQbo(id: string) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request<Invoice>(`/api/invoices/${id}/retry-qbo`, { method: "POST" }),
    onSuccess: (data) => {
      qc.setQueryData(qk.invoices.detail(id), data);
    },
  });
}

export function useVendors() {
  const { request } = useApi();
  return useQuery({
    queryKey: qk.vendors.list(),
    queryFn: () => request<{ vendors: Vendor[] }>("/api/vendors"),
    staleTime: 60_000,
  });
}

export function useProjects() {
  const { request } = useApi();
  return useQuery({
    queryKey: qk.projects.list(),
    queryFn: () => request<{ projects: Project[] }>("/api/projects"),
    staleTime: 60_000,
  });
}
