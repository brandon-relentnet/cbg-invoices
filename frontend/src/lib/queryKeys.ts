/**
 * Centralized React Query keys — use these instead of inline tuples
 * so invalidation stays in sync across the app.
 */
export const qk = {
  all: ["cbg"] as const,

  me: () => [...qk.all, "me"] as const,

  invoices: {
    root: () => [...qk.all, "invoices"] as const,
    list: (params: Record<string, unknown>) => [...qk.invoices.root(), "list", params] as const,
    detail: (id: string) => [...qk.invoices.root(), "detail", id] as const,
    pdf: (id: string) => [...qk.invoices.root(), "pdf", id] as const,
  },

  vendors: {
    root: () => [...qk.all, "vendors"] as const,
    list: () => [...qk.vendors.root(), "list"] as const,
  },

  projects: {
    root: () => [...qk.all, "projects"] as const,
    list: () => [...qk.projects.root(), "list"] as const,
  },

  qbo: {
    root: () => [...qk.all, "qbo"] as const,
    status: () => [...qk.qbo.root(), "status"] as const,
  },

  audit: {
    root: () => [...qk.all, "audit"] as const,
    list: (params: Record<string, unknown>) => [...qk.audit.root(), "list", params] as const,
  },
} as const;
