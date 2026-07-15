import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowUpTrayIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import type { Invoice } from "@/types";
import type { TeamMember } from "@/lib/users";
import {
  PostStateBadge,
  StatusBadge,
  TriageReasonBadge,
} from "@/components/invoices/StatusBadge";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { formatCents, formatRelative } from "@/lib/format";
import {
  useClaimInvoice,
  usePostInvoice,
  usePromoteFromTriage,
  useRejectInvoice,
} from "@/lib/invoices";
import { qk } from "@/lib/queryKeys";

const ACTIVE = new Set(["ready_for_review", "extraction_failed", "received", "extracting"]);

function initials(source: string): string {
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** A compact, on-brand primary action button used inline in the row. */
function ActionButton({
  onClick,
  loading,
  children,
}: {
  onClick: () => void;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-2.5 min-h-[32px] text-xs font-bold uppercase tracking-wider border border-navy/40 text-navy hover:bg-navy hover:text-stone disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
    >
      {loading && (
        <span
          aria-hidden
          className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      )}
      {children}
    </button>
  );
}

function TextLink({ invoiceId, children }: { invoiceId: string; children: React.ReactNode }) {
  return (
    <Link
      to="/invoices/$id"
      params={{ id: invoiceId }}
      className="text-xs font-semibold text-slate-500 hover:text-navy whitespace-nowrap"
    >
      {children}
    </Link>
  );
}

export function QueueRow({
  invoice,
  me,
  qboConnected,
  onReject,
}: {
  invoice: Invoice;
  me: TeamMember | null;
  qboConnected: boolean;
  onReject: (invoice: Invoice) => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const claim = useClaimInvoice(invoice.id);
  const post = usePostInvoice(invoice.id);
  const promote = usePromoteFromTriage(invoice.id);
  const [posting, setPosting] = useState(false);

  const isAdmin = me?.role === "owner" || me?.role === "admin";
  const isMine = !!me && invoice.assigned_to_id === me.id;
  const isClaimed = !!invoice.claimed_at;
  const isTriage = invoice.status === "needs_triage";
  const isActive = ACTIVE.has(invoice.status);

  function bumpQueue() {
    const bump = () => void qc.invalidateQueries({ queryKey: qk.invoices.root() });
    setTimeout(bump, 1500);
    setTimeout(bump, 4000);
    setTimeout(bump, 8000);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the optimistic post flag when an error surfaces
    if (posting && invoice.qbo_post_error) setPosting(false);
  }, [invoice.qbo_post_error, posting]);

  function goReview() {
    void navigate({ to: "/invoices/$id", params: { id: invoice.id } });
  }

  async function claimAndReview() {
    await claim.mutateAsync();
    goReview();
  }

  function triggerPost() {
    post.mutate(undefined, {
      onSuccess: () => {
        setPosting(true);
        bumpQueue();
      },
    });
  }

  // Left adornment: assignee initials when claimed, else the source icon.
  const assigneeLabel =
    invoice.assigned_to_name || invoice.assigned_to_email || invoice.assigned_to_id;
  const left = assigneeLabel ? (
    <span
      className="inline-flex items-center justify-center h-7 w-7 bg-navy text-stone text-[10px] font-semibold tracking-wider"
      title={assigneeLabel}
      aria-hidden
    >
      {initials(assigneeLabel)}
    </span>
  ) : (
    <span className="inline-flex items-center justify-center h-7 w-7 bg-stone/70 text-slate-500">
      {isTriage ? (
        <ExclamationTriangleIcon className="h-4 w-4" aria-hidden />
      ) : invoice.source === "email" ? (
        <EnvelopeIcon className="h-4 w-4" aria-label="Email" />
      ) : (
        <ArrowUpTrayIcon className="h-4 w-4" aria-label="Upload" />
      )}
    </span>
  );

  // Whatever row action last failed — the backend's message says why (e.g.
  // "Cambridge AP coding incomplete — fill in job number…"). Without this the
  // click just silently does nothing. Cleared by react-query on the next try.
  const actionError = (post.error ?? claim.error ?? promote.error) as Error | null;

  // Meta sub-line: only the parts that exist, joined by · — keeps it calm.
  const meta = [
    invoice.invoice_number ? `#${invoice.invoice_number}` : null,
    invoice.job_number ? `Job ${invoice.job_number}` : null,
    !assigneeLabel && invoice.sender_email ? invoice.sender_email : null,
    formatRelative(invoice.received_at),
  ]
    .filter(Boolean)
    .join("  ·  ");

  // The single (or paired) next action for this row.
  //
  //   Admin   → review/act on anything directly (no self-assign).
  //   Member  → only their assigned invoices, and "Claim & review" first to
  //             signal they've taken ownership. Triage is admin-only.
  let action: React.ReactNode;
  if (isTriage) {
    action = (
      <>
        {isAdmin && (
          <button
            type="button"
            onClick={() => onReject(invoice)}
            className="text-xs font-semibold text-slate-500 hover:text-red-700 whitespace-nowrap"
          >
            Reject
          </button>
        )}
        <ActionButton onClick={() => promote.mutate(undefined, { onSuccess: bumpQueue })} loading={promote.isPending}>
          Promote
        </ActionButton>
      </>
    );
  } else if (isActive) {
    if (isAdmin) {
      action = <ActionButton onClick={goReview}>Review</ActionButton>;
    } else if (isMine) {
      action = isClaimed ? (
        <ActionButton onClick={goReview}>Review</ActionButton>
      ) : (
        <ActionButton onClick={claimAndReview} loading={claim.isPending}>
          Claim &amp; review
        </ActionButton>
      );
    } else {
      action = <TextLink invoiceId={invoice.id}>Open →</TextLink>;
    }
  } else if (invoice.status === "approved" && qboConnected && (isAdmin || isMine)) {
    action = (
      <>
        <TextLink invoiceId={invoice.id}>Open</TextLink>
        <ActionButton onClick={triggerPost} loading={post.isPending || posting}>
          <PaperAirplaneIcon className="h-3.5 w-3.5" aria-hidden />
          {post.isPending || posting ? "Posting…" : "Post"}
        </ActionButton>
      </>
    );
  } else {
    action = <TextLink invoiceId={invoice.id}>Open →</TextLink>;
  }

  const showAmount = !isTriage || invoice.total_cents != null;

  return (
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-amber/5 transition-colors">
      <span className="flex-shrink-0">{left}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to="/invoices/$id"
            params={{ id: invoice.id }}
            className="font-semibold text-navy hover:text-amber truncate"
          >
            {invoice.vendor_name || (
              <span className="text-slate-400 italic">Unknown vendor</span>
            )}
          </Link>
          {isTriage && invoice.triage_reason ? (
            <TriageReasonBadge reason={invoice.triage_reason} />
          ) : (
            <span className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
              <StatusBadge status={invoice.status} />
              <PostStateBadge invoice={invoice} />
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-slate-500 truncate">{meta}</div>
        {actionError && (
          <div
            className="mt-0.5 text-xs font-medium text-red-700 truncate"
            title={actionError.message}
          >
            {actionError.message}
          </div>
        )}
      </div>

      {showAmount && (
        <div className="flex-shrink-0 text-sm font-semibold text-navy tabular-nums">
          {formatCents(invoice.total_cents, invoice.currency)}
        </div>
      )}

      <div className="flex-shrink-0 flex items-center gap-3">{action}</div>
    </li>
  );
}

/** Shared reject-with-reason modal, opened from a triage row. */
export function QueueRejectModal({
  invoice,
  onClose,
}: {
  invoice: Invoice;
  onClose: () => void;
}) {
  const reject = useRejectInvoice(invoice.id);
  const qc = useQueryClient();
  const [reason, setReason] = useState("");

  async function submit() {
    await reject.mutateAsync(reason.trim());
    void qc.invalidateQueries({ queryKey: qk.invoices.root() });
    onClose();
  }

  return (
    <BottomSheet open onClose={onClose} ariaLabel="Reject invoice" maxWidth="max-w-md">
      <div className="p-4 space-y-4">
        <div>
          <h2 className="font-display text-xl text-navy">
            Reject {invoice.vendor_name || "this document"}?
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            It moves out of triage and is kept for the audit trail. Add a short reason.
          </p>
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          autoFocus
          placeholder="e.g. Statement, not an invoice"
          className="block w-full p-3 border border-slate-300 bg-stone/50 text-graphite text-sm focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber placeholder:text-slate-400"
        />
        <div className="flex gap-3">
          <Button
            variant="destructive"
            onClick={submit}
            loading={reject.isPending}
            disabled={!reason.trim()}
          >
            Reject
          </Button>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
