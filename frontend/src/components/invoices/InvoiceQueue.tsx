import { useState } from "react";
import { useInvoices } from "@/lib/invoices";
import type { InvoiceStatus } from "@/types";
import { InvoiceRow } from "./InvoiceRow";
import { UploadDropzone } from "./UploadDropzone";
import { cn } from "@/lib/cn";

type FilterKey = "needs_review" | "pending" | "approved" | "failed" | "rejected" | "all";

const FILTERS: { key: FilterKey; label: string; status: InvoiceStatus[] | undefined }[] = [
  { key: "needs_review", label: "Needs review", status: ["ready_for_review"] },
  { key: "pending", label: "Pending", status: ["received", "extracting"] },
  { key: "approved", label: "Posted", status: ["approved", "posted_to_qbo"] },
  { key: "failed", label: "Failed", status: ["extraction_failed"] },
  { key: "rejected", label: "Rejected", status: ["rejected"] },
  { key: "all", label: "All", status: undefined },
];

export function InvoiceQueue() {
  const [filter, setFilter] = useState<FilterKey>("needs_review");
  const [q, setQ] = useState("");
  const selectedFilter = FILTERS.find((f) => f.key === filter)!;
  const { data, isLoading, error } = useInvoices({
    status: selectedFilter.status,
    q: q || undefined,
    page_size: 50,
  });

  const empty = !isLoading && (data?.invoices.length ?? 0) === 0;

  return (
    <div className="space-y-6">
      {/* Filter chips + search */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors",
                "border",
                filter === f.key
                  ? "bg-navy text-stone border-navy"
                  : "bg-white text-slate-600 border-slate-300 hover:border-navy",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search vendor, invoice #, PO…"
          className={cn(
            "px-3 py-1.5 text-sm bg-white border border-slate-300",
            "focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber",
            "w-full sm:w-64",
          )}
          aria-label="Search invoices"
        />
      </div>

      {/* Upload */}
      <UploadDropzone />

      {/* Table */}
      <div className="bg-white border-t-4 border-amber">
        {isLoading && (
          <div className="px-6 py-12 text-center text-slate-500 text-sm">Loading…</div>
        )}
        {error && (
          <div className="px-6 py-12 text-center text-red-700 text-sm">
            Failed to load invoices: {(error as Error).message}
          </div>
        )}
        {!isLoading && !error && empty && (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-slate-600">No invoices match this filter yet.</p>
            <p className="text-xs text-slate-500 mt-1">
              Upload a PDF above, or forward one to your Postmark inbound address.
            </p>
          </div>
        )}
        {!isLoading && !error && !empty && (
          <table className="w-full">
            <thead className="bg-stone/50">
              <tr className="border-b border-stone/60 text-xs font-bold uppercase tracking-widest text-amber">
                <th className="px-4 py-3 text-left">Received</th>
                <th className="px-4 py-3 text-left">Vendor</th>
                <th className="px-4 py-3 text-left">Invoice #</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data!.invoices.map((inv) => (
                <InvoiceRow key={inv.id} invoice={inv} />
              ))}
            </tbody>
          </table>
        )}
        {data && data.total > (data.page_size ?? 50) && (
          <div className="px-4 py-3 text-xs text-slate-500 border-t border-stone/60">
            Showing {data.invoices.length} of {data.total}
          </div>
        )}
      </div>
    </div>
  );
}
