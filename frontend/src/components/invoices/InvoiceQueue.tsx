import { useMemo, useState } from "react";
import { UserCircleIcon } from "@heroicons/react/24/outline";
import { useUser } from "@/lib/auth";
import { useInvoices } from "@/lib/invoices";
import type { InvoiceStatus } from "@/types";
import { InvoiceRow, InvoiceCard } from "./InvoiceRow";
import { UploadDropzone } from "./UploadDropzone";
import { cn } from "@/lib/cn";

// Simplified filter model: 5 primary tabs + a cross-cutting "Mine only" toggle.
//
// "Needs Review" absorbs the short-lived in-flight states (received,
// extracting, extraction_failed) so those invoices are always visible where
// the user looks, rather than hiding them in a separate tab.
interface FilterDef {
  key: string;
  label: string;
  status: InvoiceStatus[];
}

const FILTERS: FilterDef[] = [
  {
    key: "needs_review",
    label: "Needs Review",
    status: ["ready_for_review", "extraction_failed", "received", "extracting"],
  },
  { key: "pending", label: "Pending", status: ["pending"] },
  { key: "approved", label: "Approved", status: ["approved"] },
  { key: "posted", label: "Posted", status: ["posted_to_qbo"] },
  { key: "archive", label: "Archive", status: ["rejected"] },
];

export function InvoiceQueue() {
  const user = useUser();
  const [filterKey, setFilterKey] = useState<string>("needs_review");
  const [q, setQ] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const mySub = user?.id ?? null;

  const filter = FILTERS.find((f) => f.key === filterKey) ?? FILTERS[0];

  const { data, isLoading, error } = useInvoices({
    status: filter.status,
    q: q || undefined,
    page_size: 100,
  });

  const invoices = useMemo(() => {
    const list = data?.invoices ?? [];
    if (mineOnly && mySub) {
      return list.filter((inv) => inv.assigned_to_id === mySub);
    }
    return list;
  }, [data, mineOnly, mySub]);

  const empty = !isLoading && invoices.length === 0;

  return (
    <div className="space-y-6">
      {/* Upload dropzone FIRST — primary action on this page */}
      <UploadDropzone />

      {/* Filter chips row with Mine toggle on the right */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterKey(f.key)}
              className={cn(
                "px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors",
                "border",
                filterKey === f.key
                  ? "bg-navy text-stone border-navy"
                  : "bg-white text-slate-600 border-slate-300 hover:border-navy",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Mine-only toggle pill */}
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            disabled={!mySub}
            title={mySub ? "Only show invoices assigned to you" : "Sign in to enable"}
            aria-pressed={mineOnly}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors border",
              mineOnly
                ? "bg-amber text-navy border-amber"
                : "bg-white text-slate-600 border-slate-300 hover:border-amber",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <UserCircleIcon className="h-4 w-4" />
            Mine only
          </button>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search vendor, invoice #, PO…"
            className={cn(
              "px-3 py-1.5 text-sm bg-white border border-slate-300",
              "focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber",
              "w-full sm:w-56",
            )}
            aria-label="Search invoices"
          />
        </div>
      </div>

      {/* Results */}
      <div className="bg-white border-t-4 border-amber">
        {isLoading && <QueueSkeleton />}
        {error && (
          <div className="px-6 py-12 text-center text-red-700 text-sm">
            Failed to load invoices: {(error as Error).message}
          </div>
        )}
        {!isLoading && !error && empty && (
          <EmptyState filterKey={filterKey} mineOnly={mineOnly} />
        )}
        {!isLoading && !error && !empty && (
          <>
            {/* Mobile / tablet: stacked cards */}
            <ul className="md:hidden divide-y divide-stone/60">
              {invoices.map((inv) => (
                <InvoiceCard key={inv.id} invoice={inv} />
              ))}
            </ul>

            {/* Desktop: full table */}
            <table className="hidden md:table w-full">
              <thead className="bg-stone/50">
                <tr className="border-b border-stone/60 text-xs font-bold uppercase tracking-widest text-amber">
                  <th className="px-4 py-3 text-left">Received</th>
                  <th className="px-4 py-3 text-left">Vendor</th>
                  <th className="px-4 py-3 text-left">Invoice #</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-left">Assignee</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <InvoiceRow key={inv.id} invoice={inv} />
                ))}
              </tbody>
            </table>
          </>
        )}
        {data && data.total > invoices.length && !mineOnly && (
          <div className="px-4 py-3 text-xs text-slate-500 border-t border-stone/60">
            Showing {invoices.length} of {data.total}
          </div>
        )}
      </div>
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div className="p-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-2 py-3 border-b border-stone/40 last:border-none animate-pulse"
        >
          <div className="h-4 w-20 bg-stone/60" />
          <div className="flex-1 h-4 bg-stone/60 max-w-[40%]" />
          <div className="h-4 w-24 bg-stone/60" />
          <div className="h-4 w-20 bg-stone/60" />
          <div className="h-4 w-16 bg-stone/60" />
          <div className="h-4 w-20 bg-stone/60" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  filterKey,
  mineOnly,
}: {
  filterKey: string;
  mineOnly: boolean;
}) {
  const copy: Record<string, { title: string; body: string }> = {
    needs_review: {
      title: "Inbox is clear",
      body: "Nothing waiting on review. Upload a PDF above, or forward one to your Postmark address.",
    },
    pending: {
      title: "No parked invoices",
      body: "Invoices you Send to Pending will land here.",
    },
    approved: {
      title: "No approved invoices awaiting post",
      body: "Approve without posting to sit them here until you're ready.",
    },
    posted: {
      title: "Nothing posted yet",
      body: "Once you post invoices to QuickBooks they'll show up here.",
    },
    archive: {
      title: "Archive is empty",
      body: "Rejected invoices are kept here for the audit trail.",
    },
  };
  const base = copy[filterKey] ?? {
    title: "Nothing here",
    body: "Try a different filter.",
  };
  const title = mineOnly ? "Nothing assigned to you" : base.title;
  const body = mineOnly
    ? "Turn off Mine only to see the full team's work."
    : base.body;
  return (
    <div className="px-6 py-14 text-center">
      <p className="font-display text-lg text-navy">{title}</p>
      <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">{body}</p>
    </div>
  );
}
