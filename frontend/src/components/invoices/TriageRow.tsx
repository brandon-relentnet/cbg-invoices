/**
 * Row + card variants for the queue's "Triage" tab.
 *
 * Visually parallel to InvoiceRow / InvoiceCard, but the row's action
 * cell is dedicated to triage-resolution affordances:
 *
 *   - Promote: confirm this is a real invoice → moves to the main queue.
 *   - Trust sender: only when triage_reason === 'unknown_sender'. Marks
 *     the registrable domain as trusted and promotes in one click.
 *   - Reject: archive the row. Sends a default reason derived from
 *     ``triage_reason`` so the operator doesn't have to type a reason
 *     for the most-common cases.
 *
 * Per-reason document context (TriageReasonBadge + DocumentTypeBadge) is
 * rendered prominently so AP can decide on the right action without
 * having to open every PDF.
 */
import { Link } from "@tanstack/react-router";
import {
  ArrowUpTrayIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import type { Invoice, TriageReason } from "@/types";
import {
  DocumentTypeBadge,
  TriageReasonBadge,
} from "@/components/invoices/StatusBadge";
import { formatCents, formatRelative } from "@/lib/format";
import {
  usePromoteFromTriage,
  useRejectInvoice,
  useTrustSenderAndPromote,
} from "@/lib/invoices";
import { cn } from "@/lib/cn";


/** Default reject reason copy per triage reason. */
function rejectReasonFor(reason: TriageReason | null): string {
  switch (reason) {
    case "non_invoice":
      return "Triage rejected — document is not an invoice";
    case "encrypted_pdf":
      return "Triage rejected — encrypted PDF, vendor needs to resend";
    case "low_confidence":
      return "Triage rejected after review";
    case "body_rendered":
      return "Triage rejected — email body, not a real invoice";
    case "unknown_sender":
      return "Triage rejected — unrecognized sender";
    default:
      return "Triage rejected";
  }
}


// ──────────────────────────────────────────────────────────────────────────
// Desktop table row
// ──────────────────────────────────────────────────────────────────────────

export function TriageRow({ invoice }: { invoice: Invoice }) {
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
          <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[24ch]">
            {invoice.sender_email}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        <div className="flex items-center gap-1.5 flex-wrap">
          {invoice.triage_reason && (
            <TriageReasonBadge reason={invoice.triage_reason} />
          )}
          {invoice.document_type && (
            <DocumentTypeBadge type={invoice.document_type} />
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-right font-semibold text-navy tabular-nums">
        {formatCents(invoice.total_cents, invoice.currency)}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <TriageActions invoice={invoice} />
      </td>
    </tr>
  );
}


// ──────────────────────────────────────────────────────────────────────────
// Mobile card
// ──────────────────────────────────────────────────────────────────────────

export function TriageCard({ invoice }: { invoice: Invoice }) {
  return (
    <li className="px-4 py-4 hover:bg-amber/5 transition-colors">
      <Link
        to="/invoices/$id"
        params={{ id: invoice.id }}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-navy truncate">
              {invoice.vendor_name ?? (
                <span className="text-slate-400 italic">Unknown vendor</span>
              )}
            </div>
            {invoice.sender_email && (
              <div className="text-xs text-slate-500 mt-0.5 truncate">
                {invoice.sender_email}
              </div>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-semibold text-navy tabular-nums">
              {formatCents(invoice.total_cents, invoice.currency)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {formatRelative(invoice.received_at)}
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {invoice.triage_reason && (
            <TriageReasonBadge reason={invoice.triage_reason} />
          )}
          {invoice.document_type && (
            <DocumentTypeBadge type={invoice.document_type} />
          )}
        </div>
      </Link>

      {/* Actions live OUTSIDE the link so the buttons aren't swallowed
          by the row click target. */}
      <div className="mt-3">
        <TriageActions invoice={invoice} layout="card" />
      </div>
    </li>
  );
}


// ──────────────────────────────────────────────────────────────────────────
// Action buttons (shared between row + card)
// ──────────────────────────────────────────────────────────────────────────

interface TriageActionsProps {
  invoice: Invoice;
  /** Stack vertically on mobile cards, inline on desktop rows. */
  layout?: "row" | "card";
}

function TriageActions({ invoice, layout = "row" }: TriageActionsProps) {
  const promote = usePromoteFromTriage(invoice.id);
  const trustAndPromote = useTrustSenderAndPromote(invoice.id);
  const reject = useRejectInvoice(invoice.id);

  const isUnknownSender = invoice.triage_reason === "unknown_sender";
  const canTrust = !!invoice.sender_email;
  const busy =
    promote.isPending || trustAndPromote.isPending || reject.isPending;

  const handlePromote = () => {
    if (busy) return;
    promote.mutate();
  };
  const handleTrust = () => {
    if (busy || !canTrust) return;
    trustAndPromote.mutate();
  };
  const handleReject = () => {
    if (busy) return;
    reject.mutate(rejectReasonFor(invoice.triage_reason));
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        layout === "card" ? "flex-wrap" : "justify-end",
      )}
    >
      {/* "Trust + promote" only for unknown_sender flows */}
      {isUnknownSender && canTrust && (
        <button
          type="button"
          onClick={handleTrust}
          disabled={busy}
          className={cn(
            "inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5",
            "text-xs font-semibold uppercase tracking-wider",
            "border border-amber bg-white text-navy hover:bg-amber/10",
            "transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
          title="Add this sender's domain to the trusted list and move to the main queue"
        >
          <ShieldCheckIcon className="h-3.5 w-3.5" />
          <span>Trust + promote</span>
        </button>
      )}

      <button
        type="button"
        onClick={handlePromote}
        disabled={busy}
        className={cn(
          "inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5",
          "text-xs font-semibold uppercase tracking-wider",
          "bg-amber text-navy hover:bg-amber/90 transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <CheckCircleIcon className="h-3.5 w-3.5" />
        <span>Promote</span>
      </button>

      <button
        type="button"
        onClick={handleReject}
        disabled={busy}
        className={cn(
          "inline-flex items-center gap-1 min-h-[36px] px-3 py-1.5",
          "text-xs font-semibold uppercase tracking-wider",
          "bg-white text-red-700 border border-red-200 hover:bg-red-50",
          "transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <XCircleIcon className="h-3.5 w-3.5" />
        <span>Reject</span>
      </button>
    </div>
  );
}
