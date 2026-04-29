import { useState } from "react";
import {
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  InboxIcon,
  UserCircleIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { useUser } from "@/lib/auth";
import { useInvoices, type ListParams } from "@/lib/invoices";
import type { InvoiceStatus } from "@/types";
import { InvoiceRow, InvoiceCard } from "./InvoiceRow";
import { UploadDropzone } from "./UploadDropzone";
import { EmptyState as UiEmptyState } from "@/components/ui/EmptyState";
import { FilterChips } from "@/components/ui/FilterChips";
import { cn } from "@/lib/cn";

/**
 * The queue's filter model is a four-stage workflow:
 *
 *   Need Review (unassigned) → Assigned (in flight) → Approved → Archived
 *
 * Each stage corresponds to a tab. Posted-to-QBO invoices are folded into
 * the Approved tab and differentiated by a per-row sub-badge — keeping the
 * "done" view as a single place to look. Archived (rejected) is kept
 * deliberately subdued since it's a reference view, not a daily workflow.
 *
 * The "Mine only" toggle applies on Assigned + Approved only — on Need
 * Review it would always be empty (those invoices are unassigned by
 * definition), and on Archived it isn't useful for daily work.
 */
type FilterKey = "need_review" | "assigned" | "approved" | "archived";

interface FilterDef {
  key: FilterKey;
  label: string;
  status: InvoiceStatus[];
  /**
   * Default value of the `assigned` server-side param when this tab is
   * active. The Mine toggle (when applicable) overrides to "mine".
   */
  defaultAssigned?: "true" | "false";
  /** Whether the "Mine only" toggle should appear when this tab is active. */
  mineCapable: boolean;
}

const ACTIVE_STATUSES: InvoiceStatus[] = [
  "ready_for_review",
  "extraction_failed",
  "received",
  "extracting",
];

const FILTERS: FilterDef[] = [
  {
    key: "need_review",
    label: "Need Review",
    status: ACTIVE_STATUSES,
    defaultAssigned: "false",
    mineCapable: false,
  },
  {
    key: "assigned",
    label: "Assigned",
    status: ACTIVE_STATUSES,
    defaultAssigned: "true",
    mineCapable: true,
  },
  {
    key: "approved",
    label: "Approved",
    status: ["approved", "posted_to_qbo"],
    mineCapable: true,
  },
  {
    key: "archived",
    label: "Archived",
    status: ["rejected"],
    mineCapable: false,
  },
];

const PRIMARY_FILTERS = FILTERS.filter((f) => f.key !== "archived");

export function InvoiceQueue() {
  const user = useUser();
  const [filterKey, setFilterKey] = useState<FilterKey>("need_review");
  const [q, setQ] = useState("");
  const [job, setJob] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const mySub = user?.id ?? null;

  const filter = FILTERS.find((f) => f.key === filterKey) ?? FILTERS[0];
  const showMineToggle = filter.mineCapable;
  const effectiveMine = mineOnly && showMineToggle && !!mySub;

  // Compose the server-side query. The tab picks the assignment default;
  // the Mine toggle overrides it.
  const queryParams: ListParams = {
    status: filter.status,
    q: q || undefined,
    job: job || undefined,
    page_size: 100,
    assigned: effectiveMine
      ? "mine"
      : filter.defaultAssigned ?? undefined,
  };

  const { data, isLoading, error } = useInvoices(queryParams);

  const invoices = data?.invoices ?? [];
  const empty = !isLoading && invoices.length === 0;

  const total = data?.total ?? 0;

  // Reset Mine when switching to a tab that doesn't support it, otherwise
  // it'd silently no-op.
  const handleTabChange = (key: string) => {
    const next = key as FilterKey;
    setFilterKey(next);
    const def = FILTERS.find((f) => f.key === next);
    if (def && !def.mineCapable) setMineOnly(false);
  };

  const isArchived = filterKey === "archived";

  return (
    <div className="space-y-6">
      {/* Upload dropzone FIRST — primary action on this page */}
      <UploadDropzone />

      {/* Filter row */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex-1 min-w-0">
            <FilterChips
              chips={PRIMARY_FILTERS.map((f) => ({ key: f.key, label: f.label }))}
              active={isArchived ? "" : filterKey}
              onChange={handleTabChange}
            />
          </div>
          {/* Mine toggle — only when meaningful */}
          {showMineToggle && (
            <button
              type="button"
              onClick={() => setMineOnly((v) => !v)}
              disabled={!mySub}
              title={mySub ? "Only show invoices assigned to you" : "Sign in to enable"}
              aria-pressed={mineOnly}
              className={cn(
                "flex-shrink-0 inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors border",
                mineOnly
                  ? "bg-amber text-navy border-amber"
                  : "bg-white text-slate-600 border-slate-300 hover:border-amber",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <UserCircleIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Mine only</span>
              <span className="sm:hidden">Mine</span>
            </button>
          )}
        </div>

        {/* Search + Job# inputs (hidden in archived view to keep it minimal) */}
        {!isArchived && (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search vendor, invoice #, PO…"
              className={cn(
                "block w-full sm:flex-1 min-h-[44px] md:min-h-0 px-3 py-2 text-base md:text-sm bg-white border border-slate-300",
                "focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber",
              )}
              aria-label="Search invoices"
            />
            <input
              type="search"
              value={job}
              onChange={(e) => setJob(e.target.value)}
              placeholder="Job #"
              className={cn(
                "block w-full sm:w-32 min-h-[44px] md:min-h-0 px-3 py-2 text-base md:text-sm font-mono bg-white border border-slate-300",
                "focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber",
              )}
              aria-label="Filter by job number"
            />
          </div>
        )}

        {/* Subdued archive link, right-aligned. Toggle in/out without
            taking up the same visual weight as the primary chips. */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() =>
              setFilterKey(isArchived ? "need_review" : "archived")
            }
            className={cn(
              "inline-flex items-center gap-1 text-xs uppercase tracking-wider font-semibold transition-colors min-h-[32px] px-2",
              isArchived
                ? "text-navy hover:text-amber"
                : "text-slate-400 hover:text-navy",
            )}
            aria-pressed={isArchived}
          >
            {isArchived ? (
              <>
                <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                <span>Back to active</span>
              </>
            ) : (
              <>
                <ArchiveBoxIcon className="h-3.5 w-3.5" />
                <span>Archived</span>
              </>
            )}
          </button>
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
          <EmptyState filterKey={filterKey} mineOnly={effectiveMine} />
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
                  <th className="px-4 py-3 text-left">Job</th>
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
        {data && total > invoices.length && (
          <div className="px-4 py-3 text-xs text-slate-500 border-t border-stone/60">
            Showing {invoices.length} of {total}
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
  filterKey: FilterKey;
  mineOnly: boolean;
}) {
  const copy: Record<
    FilterKey,
    {
      title: string;
      body: string;
      Icon: typeof InboxIcon;
    }
  > = {
    need_review: {
      title: "Inbox is clear",
      body: "Nothing waiting to be picked up. Upload a PDF above, or have a vendor email it to your inbound address.",
      Icon: InboxIcon,
    },
    assigned: {
      title: "Nothing in flight",
      body: "Once someone picks up an invoice, it shows here while they work on it.",
      Icon: UsersIcon,
    },
    approved: {
      title: "Nothing approved yet",
      body: "Approved and posted invoices live here. Each row tells you whether it's already in QuickBooks.",
      Icon: CheckCircleIcon,
    },
    archived: {
      title: "Archive is empty",
      body: "Rejected invoices are kept here for the audit trail.",
      Icon: ArchiveBoxIcon,
    },
  };
  const base = copy[filterKey];
  const title = mineOnly ? "Nothing assigned to you" : base.title;
  const body = mineOnly
    ? "Turn off Mine only to see the full team's work."
    : base.body;
  return <UiEmptyState Icon={base.Icon} title={title} body={body} />;
}
