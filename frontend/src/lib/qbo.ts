/**
 * QuickBooks Online hooks. Filled in by phase 7.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import type { QboStatus } from "@/types";

export function useQboStatus() {
  const { request } = useApi();
  return useQuery({
    queryKey: qk.qbo.status(),
    queryFn: () => request<QboStatus>("/api/qbo/status"),
    staleTime: 30_000,
  });
}

export function useConnectQbo() {
  const { request } = useApi();
  return useMutation({
    mutationFn: async () => {
      const { url } = await request<{ url: string }>("/api/qbo/connect");
      window.location.href = url;
    },
  });
}

export function useDisconnectQbo() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request<void>("/api/qbo/disconnect", { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.qbo.status() });
    },
  });
}

export function useSyncVendors() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request<{ count: number }>("/api/qbo/sync/vendors", { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.vendors.root() });
      void qc.invalidateQueries({ queryKey: qk.qbo.status() });
    },
  });
}

export function useSyncProjects() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => request<{ count: number }>("/api/qbo/sync/projects", { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.projects.root() });
      void qc.invalidateQueries({ queryKey: qk.qbo.status() });
    },
  });
}
