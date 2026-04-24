import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpTrayIcon,
  EnvelopeIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import type { Invoice } from "@/types";
import { StatusBadge } from "@/components/invoices/StatusBadge";
import { formatCents, formatRelative } from "@/lib/format";
import { usePostInvoice } from "@/lib/invoices";
import { useQboStatus } from "@/lib/qbo";
import { qk } from "@/lib/queryKeys";

export function InvoiceRow({ invoice }: { invoice: Invoice }) {
  return (
    <tr className="border-b border-stone/60 hover:bg-amber/5 transition-colors group">
      <td className="px-4 py-3 text-sm">
        <div className="flex items-center gap-2 text-slate-600">
          {invoice.source === "email" ? (
            <EnvelopeIcon className="h-4 w-4" aria-label="Email" />
          ) : (
            <ArrowUpTrayIcon className="h-4 w-4" aria-label="Upload" />
          )}
          <span>{formatRelative(invoice.received_at)}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm">
        <div className="font-semibold text-navy">
          {invoice.vendor_name ?? (
            <span className="text-slate-400 italic">Unknown</span>
          )}
        </div>
        {invoice.sender_email && (
          <div className="text-xs text-slate-500 truncate max-w-[20ch]">
            {invoice.sender_email}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-sm font-mono text-graphite">
        {invoice.invoice_number ?? "—"}
      </td>
      <td className="px-4 py-3 text-sm text-right font-semibold text-navy tabular-nums">
        {formatCents(invoice.total_cents, invoice.currency)}
      </td>
      <td className="px-4 py-3 text-sm">
        <AssigneeCell invoice={invoice} />
      </td>
      <td className="px-4 py-3 text-sm">
        <StatusBadge status={invoice.status} />
        {invoice.status === "approved" && invoice.qbo_post_error && (
          <div className="text-[10px] text-red-700 mt-0.5 uppercase tracking-wider">
            Post failed
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <QuickAction invoice={invoice} />
      </td>
    </tr>
  );
}

function AssigneeCell({ invoice }: { invoice: Invoice }) {
  if (!invoice.assigned_to_id) return <span className="text-slate-300">—</span>;
  const label =
    invoice.assigned_to_name || invoice.assigned_to_email || invoice.assigned_to_id;
  const initials = makeInitials(label);
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex items-center justify-center h-6 w-6 bg-navy text-stone text-[10px] font-semibold tracking-wider"
        aria-hidden
      >
        {initials}
      </span>
      <span className="text-xs text-graphite truncate max-w-[14ch]">{label}</span>
    </div>
  );
}

function makeInitials(source: string): string {
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function QuickAction({ invoice }: { invoice: Invoice }) {
  const qbo = useQboStatus();
  const post = usePostInvoice(invoice.id);
  const qc = useQueryClient();
  // Local "posting" flag — sticks from click until invoice exits the approved
  // state (either posted_to_qbo = row disappears; or qbo_post_error appears).
  const [didPost, setDidPost] = useState(false);

  // Reset if the invoice shows an error — so the user can click again and see
  // the real retry state from a clean slate.
  useEffect(() => {
    if (didPost && invoice.qbo_post_error) setDidPost(false);
  }, [invoice.qbo_post_error, didPost]);

  function triggerPost() {
    post.mutate(undefined, {
      onSuccess: () => {
        setDidPost(true);
        // Burst-refetch the queue so the row updates faster than the 10s poll.
        const bump = () =>
          qc.invalidateQueries({ queryKey: qk.invoices.root() });
        setTimeout(bump, 1500);
        setTimeout(bump, 4000);
        setTimeout(bump, 8000);
      },
    });
  }

  if (invoice.status === "approved" && qbo.data?.connected) {
    const posting = post.isPending || didPost;
    return (
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            triggerPost();
          }}
          disabled={posting}
          className="text-xs font-semibold text-navy hover:text-amber disabled:opacity-50 inline-flex items-center gap-1"
        >
          {posting ? (
            <span
              aria-hidden
              className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent"
            />
          ) : (
            <PaperAirplaneIcon className="h-3.5 w-3.5" />
          )}
          {posting ? "Posting…" : "Post"}
        </button>
        <Link
          to="/invoices/$id"
          params={{ id: invoice.id }}
          className="text-xs text-slate-500 hover:text-navy"
        >
          Open
        </Link>
      </div>
    );
  }

  return (
    <Link
      to="/invoices/$id"
      params={{ id: invoice.id }}
      className="text-sm font-semibold text-navy hover:text-amber"
    >
      {linkLabelFor(invoice.status)} →
    </Link>
  );
}

function linkLabelFor(status: Invoice["status"]): string {
  switch (status) {
    case "ready_for_review":
    case "extraction_failed":
      return "Review";
    case "pending":
      return "Open";
    case "approved":
      return "Post";
    case "posted_to_qbo":
      return "View";
    case "rejected":
      return "View";
    case "extracting":
    case "received":
      return "Open";
    default:
      return "Open";
  }
}
