import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  UserCircleIcon,
  UserPlusIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
// ClockIcon stays in scope below — used in the StatusBanner for the
// "approved but QBO disconnected" case.
import { PageHeader } from "@/components/layout/AppShell";
import { useMobileAppBar } from "@/components/layout/MobileAppBar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { SplitButton, type SplitButtonOption } from "@/components/ui/SplitButton";
import {
  DocumentTypeBadge,
  StatusBadge,
  TriageReasonBadge,
} from "@/components/invoices/StatusBadge";
import { PdfViewer } from "@/components/invoices/PdfViewer";
import { ExtractedFieldsForm } from "@/components/invoices/ExtractedFieldsForm";
import { StampPreviewOverlay, type StampPosition } from "@/components/invoices/StampPreview";
import { InvoiceSummary } from "@/components/invoices/InvoiceSummary";
import { AssigneePicker } from "@/components/invoices/AssigneePicker";
import {
  useApproveAndPostInvoice,
  useApproveInvoice,
  useAssignInvoice,
  useInvoice,
  usePatchInvoice,
  usePostInvoice,
  useProjects,
  usePromoteFromTriage,
  useReextractInvoice,
  useRejectInvoice,
  useTrustSenderAndPromote,
  useUnapproveInvoice,
  useUnassignInvoice,
  useVendors,
  type InvoicePatchPayload,
} from "@/lib/invoices";
import type { TeamMember } from "@/lib/users";
import type { Invoice, Project, QboStatus, Vendor } from "@/types";
import { useQboStatus } from "@/lib/qbo";
import { qboBillUrl } from "@/lib/qboUrls";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authed/invoices_/$id")({
  component: InvoiceDetailPage,
});

// ──────────────────────────────────────────────────────────────────────────
// The review page has two macro-modes:
//   • "review" — status=ready_for_review / extraction_failed / received /
//                extracting. Editable form.
//   • "locked" — status=approved / posted_to_qbo / rejected. Read-only
//                summary + Edit for approved (which unapproves it first).
// ──────────────────────────────────────────────────────────────────────────

type Mode = "review" | "locked";

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  // Short burst-poll after a Post action so we see status flip to posted_to_qbo
  const [burstPoll, setBurstPoll] = useState(false);
  const invoiceQuery = useInvoice(id, { burstPoll });
  const vendorsQuery = useVendors();
  const projectsQuery = useProjects();
  const qboQuery = useQboStatus();

  const patch = usePatchInvoice(id);
  const approve = useApproveInvoice(id);
  const approveAndPost = useApproveAndPostInvoice(id);
  const postOnly = usePostInvoice(id);
  const unapprove = useUnapproveInvoice(id);
  const assign = useAssignInvoice(id);
  const unassign = useUnassignInvoice(id);
  const reject = useRejectInvoice(id);
  const reextract = useReextractInvoice(id);

  // Buffer the latest unsaved patch payload from ExtractedFieldsForm so we
  // can flush it on approve/post without re-rendering on every keystroke.
  // Named `pendingPatch` to disambiguate from the (now-removed) Pending
  // workflow status.
  const pendingPatch = useRef<InvoicePatchPayload | null>(null);
  const [dirty, setDirty] = useState(false);
  const [forceEdit, setForceEdit] = useState(false);

  // Live AP coding draft — only the 4 fields the stamp preview needs.
  // Subscribed via onCodingChange so the rest of the form keeps its
  // ref-based "no re-render on keystroke" optimization. Starts empty
  // and gets populated when ExtractedFieldsForm mounts (which fires
  // onCodingChange with the invoice's current values).
  const [codingDraft, setCodingDraft] = useState({
    job_number: "",
    cost_code: "",
    coding_date: "",
    approver: "",
  });

  // Refs to the rendered PDF page, used as the anchor for the
  // draggable stamp overlay. We resolve via querySelector after each
  // render because react-pdf's Page DOM appears asynchronously.
  const pdfColumnRef = useRef<HTMLDivElement>(null);
  const [pageEl, setPageEl] = useState<HTMLElement | null>(null);
  const [currentPdfPage, setCurrentPdfPage] = useState(1);

  // Live stamp position — falls back to invoice.stamp_position when
  // unset, then to default top-right inside the overlay component.
  const [stampPosition, setStampPosition] = useState<StampPosition | null>(null);
  // Sync from the invoice when it loads / refreshes
  useEffect(() => {
    if (invoiceQuery.data?.stamp_position) {
      setStampPosition(invoiceQuery.data.stamp_position);
    }
  }, [invoiceQuery.data?.stamp_position]);

  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);

  // Assignment modals — one flow per action that needs an assignee.
  const [assignFlow, setAssignFlow] = useState<
    null | "approve-and-assign" | "reassign"
  >(null);

  const invoice = invoiceQuery.data;

  // Mobile app-bar title: "Review" + status badge inline. Keep concise so
  // the right side has room for the back button.
  useMobileAppBar({
    title: "Review",
    action: (
      <button
        type="button"
        onClick={() => navigate({ to: "/invoices" })}
        className="inline-flex items-center min-h-[36px] px-3 text-xs font-bold uppercase tracking-wider text-navy hover:text-amber"
        aria-label="Back to queue"
      >
        ← Queue
      </button>
    ),
  });

  const mode: Mode = useMemo(() => {
    if (!invoice) return "review";
    if (
      invoice.status === "ready_for_review" ||
      invoice.status === "extraction_failed" ||
      invoice.status === "received" ||
      invoice.status === "extracting" ||
      // needs_triage stays in review mode so AP can edit fields before
      // promoting (reason banner adds Promote / Trust+promote buttons).
      invoice.status === "needs_triage"
    ) {
      return "review";
    }
    return "locked";
  }, [invoice]);

  const showEditor = mode === "review" || forceEdit;

  // Stop the burst poll once the post resolves: either status flipped to
  // posted_to_qbo / rejected / etc, OR qbo_post_error appeared.
  useEffect(() => {
    if (!invoice) return;
    if (
      burstPoll &&
      (invoice.status !== "approved" || invoice.qbo_post_error)
    ) {
      setBurstPoll(false);
    }
  }, [invoice?.status, invoice?.qbo_post_error, burstPoll]);

  // True while a QBO post is in flight — the POST returned quickly but the
  // backend task is still running. Drives the perpetual loading indicator.
  const postingInFlight =
    postOnly.isPending ||
    approveAndPost.isPending ||
    (burstPoll &&
      invoice?.status === "approved" &&
      !invoice?.qbo_bill_id &&
      !invoice?.qbo_post_error);

  // Keyboard shortcuts — context-aware
  //   ⌘+Enter        : primary action (Approve in review mode, Post when
  //                    already approved)
  //   ⌘+Shift+Enter  : Approve & Post in review mode
  //   ⌘+Shift+R      : open reject modal
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!invoice) return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (mode === "review") void handleApprove();
        else if (invoice.status === "approved") void handlePost();
      } else if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        if (mode === "review") void handleApproveAndPost();
      } else if (e.shiftKey && (e.key === "R" || e.key === "r")) {
        e.preventDefault();
        setShowRejectModal(true);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, mode]);

  if (invoiceQuery.isLoading) {
    return <div className="py-20 text-center text-slate-500 text-sm">Loading invoice…</div>;
  }
  if (invoiceQuery.error || !invoice) {
    return (
      <div className="py-20 text-center">
        <p className="text-red-700 text-sm">
          {(invoiceQuery.error as Error | null)?.message ?? "Invoice not found"}
        </p>
        <Button className="mt-4" variant="secondary" onClick={() => navigate({ to: "/invoices" })}>
          Back to queue
        </Button>
      </div>
    );
  }

  const qboConnected = qboQuery.data?.connected ?? false;
  const busy =
    patch.isPending ||
    approve.isPending ||
    approveAndPost.isPending ||
    postOnly.isPending ||
    unapprove.isPending ||
    assign.isPending ||
    unassign.isPending ||
    reject.isPending ||
    reextract.isPending;

  async function flushDirty() {
    if (dirty && pendingPatch.current) {
      await patch.mutateAsync(pendingPatch.current);
      setDirty(false);
    }
  }

  async function handleApprove() {
    await flushDirty();
    await approve.mutateAsync();
    setForceEdit(false);
  }

  async function handleApproveAndPost() {
    if (!qboConnected) return;
    await flushDirty();
    await approveAndPost.mutateAsync();
    setBurstPoll(true);
    setForceEdit(false);
  }

  async function handleApproveAndAssign(member: TeamMember | null) {
    if (!member) {
      setAssignFlow(null);
      return;
    }
    await flushDirty();
    await approve.mutateAsync();
    await assign.mutateAsync({
      user_id: member.id,
      user_email: member.email,
      user_name: member.name,
    });
    setAssignFlow(null);
    setForceEdit(false);
  }

  async function handlePost() {
    await postOnly.mutateAsync();
    setBurstPoll(true);
  }

  async function handleReassign(member: TeamMember | null) {
    if (!member) {
      setAssignFlow(null);
      return;
    }
    await assign.mutateAsync({
      user_id: member.id,
      user_email: member.email,
      user_name: member.name,
    });
    setAssignFlow(null);
  }

  async function handleReject() {
    if (!rejectReason.trim()) return;
    await reject.mutateAsync(rejectReason.trim());
    setShowRejectModal(false);
    setRejectReason("");
  }

  async function handleUnapprove() {
    await unapprove.mutateAsync();
    setForceEdit(true);
  }

  async function handleEdit() {
    // For APPROVED, this unapproves first. For POSTED_TO_QBO, we don't
    // allow edits (no button rendered). For extraction_failed the form is
    // already editable.
    if (invoice?.status === "approved") {
      await handleUnapprove();
    } else {
      setForceEdit(true);
    }
  }

  const pickerTitle: Record<NonNullable<typeof assignFlow>, string> = {
    "approve-and-assign": "Approve & assign",
    reassign: "Reassign invoice",
  };
  const pickerDescription: Record<NonNullable<typeof assignFlow>, string> = {
    "approve-and-assign": "Approve this invoice and put it on someone else's plate.",
    reassign: "Move this invoice to a different team member.",
  };
  const pickerConfirm: Record<NonNullable<typeof assignFlow>, string> = {
    "approve-and-assign": "Approve & assign",
    reassign: "Reassign",
  };

  async function onPickerSelect(member: TeamMember | null) {
    if (!assignFlow) return;
    if (assignFlow === "approve-and-assign") await handleApproveAndAssign(member);
    else if (assignFlow === "reassign") await handleReassign(member);
  }

  return (
    <>
      <PageHeader
        title="Review"
        accent="Invoice"
        subtitle={`Received ${new Date(invoice.received_at).toLocaleString()}`}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={invoice.status} />
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/invoices" })}>
              ← Queue
            </Button>
          </div>
        }
      />

      {/* Context banners */}
      <StatusBanner invoice={invoice} qbo={qboQuery.data} qboConnected={qboConnected}>
        {invoice.status === "extraction_failed" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => reextract.mutate()}
            loading={reextract.isPending}
          >
            <ArrowPathIcon className="h-4 w-4" />
            Re-extract
          </Button>
        )}
        {invoice.status === "approved" && invoice.qbo_post_error && (
          <Button
            variant="primary"
            size="sm"
            onClick={handlePost}
            loading={postOnly.isPending}
          >
            <ArrowPathIcon className="h-4 w-4" />
            Retry post to QBO
          </Button>
        )}
      </StatusBanner>

      {/* Assignment chip (visible any time the invoice has one) */}
      {invoice.assigned_to_id && (
        <div className="mb-4 inline-flex items-center gap-2 text-xs bg-white border border-slate-300 px-3 py-1.5">
          <UserCircleIcon className="h-4 w-4 text-slate-500" />
          <span className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold">
            Assigned to
          </span>
          <span className="text-graphite font-medium">
            {invoice.assigned_to_name || invoice.assigned_to_email || invoice.assigned_to_id}
          </span>
          {(mode === "review" || invoice.status === "approved") && (
            <>
              <button
                type="button"
                onClick={() => setAssignFlow("reassign")}
                className="ml-2 text-slate-400 hover:text-navy"
              >
                Change
              </button>
              <button
                type="button"
                onClick={() => unassign.mutate()}
                className="text-slate-400 hover:text-red-700"
              >
                Remove
              </button>
            </>
          )}
        </div>
      )}

      {/* Two-column on lg+; PDF on top, form below on smaller screens. */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
        {/* min-w-0 on both columns lets the grid actually shrink them to
            their 60/40 share. Without it, the line-items table's
            `min-w-[460px]` (intentional for inner horizontal scroll on
            mobile) propagates upward and forces the whole grid wider
            than the viewport, causing horizontal page scroll. */}
        <div
          ref={pdfColumnRef}
          className="relative min-w-0 lg:col-span-3 h-[55vh] sm:h-[65vh] lg:h-[calc(100vh-16rem)] lg:min-h-[600px]"
        >
          <PdfViewer
            invoiceId={id}
            downloadUrl={invoice.pdf_url ?? undefined}
            onPageChange={setCurrentPdfPage}
          />
          {/* Find the rendered PDF page element so the stamp overlay
              can position itself relative to actual page geometry, not
              the surrounding viewport / scroll area. */}
          <PageAnchor
            columnRef={pdfColumnRef}
            currentPage={currentPdfPage}
            invoiceUrl={invoice.pdf_url ?? null}
            onElement={setPageEl}
          />
          {/* Live stamp overlay. Only rendered when the user is editing
              and on page 1 (the only page the stamp lands on). When
              not editable (locked invoices), no handles, no drag —
              just the static visual. */}
          {pageEl && currentPdfPage === 1 && (
            <StampPreviewOverlay
              invoice={codingDraft}
              containerRef={{ current: pageEl }}
              position={stampPosition}
              editable={showEditor}
              onChange={(next) => {
                setStampPosition(next);
                if (next) {
                  // Persist immediately on drag-release. PATCH is
                  // idempotent and small enough that we don't need
                  // to debounce.
                  patch.mutate({ stamp_position: next });
                }
              }}
            />
          )}
          {/* Reset-to-default button when the user has moved the stamp */}
          {showEditor && stampPosition && pageEl && currentPdfPage === 1 && (
            <button
              type="button"
              onClick={() => {
                setStampPosition(null);
                patch.mutate({ stamp_position: null });
              }}
              className="absolute bottom-3 right-3 z-30 text-[10px] uppercase tracking-wider font-bold bg-white/95 text-navy hover:bg-amber px-2 py-1 border border-navy shadow"
            >
              Reset stamp
            </button>
          )}
        </div>

        <div className="min-w-0 lg:col-span-2">
          {invoice.status === "extracting" || invoice.status === "received" ? (
            <div className="text-center py-16 bg-white border-l-2 border-amber/60">
              <div
                aria-hidden
                className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-navy border-r-transparent"
              />
              <p className="mt-3 text-sm text-slate-600">
                Extracting invoice fields…
              </p>
            </div>
          ) : showEditor ? (
            <ExtractedFieldsForm
              invoice={invoice}
              vendors={vendorsQuery.data?.vendors ?? []}
              projects={projectsQuery.data?.projects ?? []}
              onChange={(p) => {
                pendingPatch.current = p;
                setDirty(true);
              }}
              onCodingChange={setCodingDraft}
              disabled={false}
            />
          ) : (
            <ReadOnlyView
              invoice={invoice}
              vendors={vendorsQuery.data?.vendors ?? []}
              projects={projectsQuery.data?.projects ?? []}
              onEdit={handleEdit}
              editBusy={unapprove.isPending}
            />
          )}
        </div>
      </div>

      {/* Sticky action footer */}
      {(showEditor || invoice.status === "approved") && (
        <ActionFooter
          invoice={invoice}
          dirty={dirty}
          busy={busy}
          qboConnected={qboConnected}
          forceEdit={forceEdit}
          showEditor={showEditor}
          postingInFlight={!!postingInFlight}
          onSave={async () => {
            await flushDirty();
          }}
          onCancelEdit={() => {
            setForceEdit(false);
            setDirty(false);
            pendingPatch.current = null;
          }}
          onReject={() => setShowRejectModal(true)}
          onApprove={handleApprove}
          onApproveAndPost={handleApproveAndPost}
          onApproveAndAssign={() => setAssignFlow("approve-and-assign")}
          onPost={handlePost}
          onUnapprove={handleUnapprove}
          patchPending={patch.isPending}
        />
      )}

      {/* Reject modal */}
      <BottomSheet
        open={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        ariaLabel="Reject invoice"
      >
        <div className="p-6">
          <h2 className="font-display text-2xl text-navy">Reject invoice</h2>
          <p className="text-sm text-slate-600 mt-1">
            Provide a reason. This is saved to the audit log.
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
            placeholder="e.g. Duplicate of invoice #INV-2025-12"
            className="mt-4 block w-full p-3 border border-slate-300 bg-stone/50 text-base md:text-sm focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber"
          />
        </div>
        <div className="px-6 py-4 bg-stone/50 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 border-t border-stone">
          <Button variant="ghost" onClick={() => setShowRejectModal(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={!rejectReason.trim()}
            loading={reject.isPending}
          >
            Reject
          </Button>
        </div>
      </BottomSheet>

      {/* Assignee picker (shared for all assign flows) */}
      <AssigneePicker
        open={assignFlow !== null}
        title={assignFlow ? pickerTitle[assignFlow] : ""}
        description={assignFlow ? pickerDescription[assignFlow] : undefined}
        confirmLabel={assignFlow ? pickerConfirm[assignFlow] : undefined}
        loading={busy}
        onClose={() => setAssignFlow(null)}
        onSelect={onPickerSelect}
      />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Page anchor — observes the column for the rendered PDF page element
// so the stamp overlay can position itself relative to actual page
// geometry. react-pdf's <Page> mounts asynchronously and re-mounts on
// scale/page changes, so we re-query whenever pdf state shifts.
// ──────────────────────────────────────────────────────────────────────────

function PageAnchor({
  columnRef,
  currentPage,
  invoiceUrl,
  onElement,
}: {
  columnRef: React.RefObject<HTMLDivElement | null>;
  currentPage: number;
  invoiceUrl: string | null;
  onElement: (el: HTMLElement | null) => void;
}) {
  // Re-find the page element whenever the PDF re-renders. We watch for
  // the data-pdf-page attribute that PdfViewer sets on the wrapper
  // around <Page>.
  useEffect(() => {
    const root = columnRef.current;
    if (!root) return;

    let raf = 0;
    const tick = () => {
      const el = root.querySelector<HTMLElement>(`[data-pdf-page="${currentPage}"]`);
      onElement(el);
    };
    // Initial probe
    tick();
    // Plus a couple of polls in case the canvas takes a few ms to mount
    raf = window.setTimeout(tick, 100) as unknown as number;
    const raf2 = window.setTimeout(tick, 400) as unknown as number;

    // And a MutationObserver to catch async swaps (page change, scale
    // change → react-pdf rebuilds the canvas)
    const obs = new MutationObserver(tick);
    obs.observe(root, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(raf);
      window.clearTimeout(raf2);
      obs.disconnect();
    };
  }, [columnRef, currentPage, invoiceUrl, onElement]);

  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// Status banner — context-sensitive feedback above the two columns.
// ──────────────────────────────────────────────────────────────────────────

function StatusBanner({
  invoice,
  qbo,
  qboConnected,
  children,
}: {
  invoice: Invoice;
  qbo: QboStatus | undefined;
  qboConnected: boolean;
  children?: React.ReactNode;
}) {
  const base =
    "mb-4 p-4 border-l-2 flex items-start gap-3";
  if (invoice.status === "extraction_failed") {
    return (
      <div className={`${base} bg-red-50 border-red-700`}>
        <ExclamationTriangleIcon className="h-5 w-5 text-red-700 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-red-900">Extraction failed</div>
          {invoice.extraction_error && (
            <div className="text-xs text-red-800 mt-1 font-mono break-all">
              {invoice.extraction_error}
            </div>
          )}
        </div>
        {children}
      </div>
    );
  }
  if (invoice.status === "approved" && invoice.qbo_post_error) {
    return (
      <div className={`${base} bg-amber/10 border-amber`}>
        <ExclamationTriangleIcon className="h-5 w-5 text-amber flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-navy">QBO posting failed</div>
          <div className="text-xs text-graphite mt-1 font-mono break-all">
            {invoice.qbo_post_error}
          </div>
        </div>
        {children}
      </div>
    );
  }
  if (invoice.status === "approved" && !qboConnected) {
    return (
      <div className={`${base} bg-amber/10 border-amber`}>
        <ClockIcon className="h-5 w-5 text-amber flex-shrink-0 mt-0.5" />
        <div className="flex-1 text-sm text-navy">
          <strong>Approved.</strong> Connect QuickBooks to post, or click{" "}
          <em>Post to QBO</em> once connected.
        </div>
      </div>
    );
  }
  if (invoice.status === "posted_to_qbo") {
    const billUrl = qboBillUrl(qbo, invoice.qbo_bill_id);
    return (
      <div className={`${base} bg-green-50 border-green-700`}>
        <CheckCircleIcon className="h-5 w-5 text-green-700 flex-shrink-0 mt-0.5" />
        <div className="flex-1 text-sm text-green-900">
          <strong>Posted to QBO</strong>
          {invoice.qbo_bill_id && <> as bill #{invoice.qbo_bill_id}</>}
          {invoice.qbo_posted_at && <> on {formatDate(invoice.qbo_posted_at)}</>}
          {invoice.reviewed_by_email && <> · reviewed by {invoice.reviewed_by_email}</>}.
          {billUrl && (
            <>
              {" "}
              <a
                href={billUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 font-semibold text-green-900 underline underline-offset-2 hover:text-green-700"
              >
                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                View in QuickBooks
              </a>
            </>
          )}
        </div>
      </div>
    );
  }
  if (invoice.status === "rejected") {
    return (
      <div className={`${base} bg-red-50 border-red-700`}>
        <XCircleIcon className="h-5 w-5 text-red-700 flex-shrink-0 mt-0.5" />
        <div className="flex-1 text-sm text-red-900">
          <strong>Rejected</strong>
          {invoice.reviewed_by_email && <> by {invoice.reviewed_by_email}</>}
          {invoice.reviewed_at && <> on {formatDate(invoice.reviewed_at)}</>}.
        </div>
      </div>
    );
  }
  if (invoice.status === "needs_triage") {
    return <TriageBanner invoice={invoice} />;
  }
  return null;
}

/**
 * Banner shown at the top of the review page for invoices in
 * NEEDS_TRIAGE. Surfaces the reason + per-reason guidance and inlines
 * the same Promote / Trust+promote / Reject actions the queue's
 * TriageRow exposes — so AP can act without scrolling to the footer.
 */
function TriageBanner({ invoice }: { invoice: Invoice }) {
  const promote = usePromoteFromTriage(invoice.id);
  const trustAndPromote = useTrustSenderAndPromote(invoice.id);

  const isUnknownSender = invoice.triage_reason === "unknown_sender";
  const canTrust = !!invoice.sender_email;
  const busy = promote.isPending || trustAndPromote.isPending;

  // Per-reason guidance text. Kept short — the badge already says what
  // the reason is; the prose tells the operator what to look for.
  const guidance: Record<NonNullable<Invoice["triage_reason"]>, string> = {
    non_invoice:
      "Claude classified this as something other than an invoice (statement, quote, order acknowledgement, receipt, or supporting document). If it's actually a real invoice, click Promote to send it to the main queue.",
    unknown_sender:
      "We don't yet trust this sender's domain. Promote if it's legitimate; click Trust + promote to skip this step for future invoices from the same domain.",
    body_rendered:
      "There was no PDF attachment — we rendered the email body as a fallback. Verify the totals and line items extracted correctly before promoting.",
    encrypted_pdf:
      "This PDF is password-protected so extraction was skipped. Ask the vendor to resend an unencrypted copy, or upload a decrypted version manually. Reject when no longer needed.",
    low_confidence:
      "Claude wasn't confident about its extraction. Review the fields, fix anything wrong, then promote when it looks right.",
  };
  const reasonText = invoice.triage_reason
    ? guidance[invoice.triage_reason]
    : "Pending decision.";

  return (
    <div className="mb-4 p-4 border-l-2 border-amber bg-amber/10 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <ExclamationTriangleIcon className="h-5 w-5 text-amber flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-navy">Needs triage</span>
            {invoice.triage_reason && (
              <TriageReasonBadge reason={invoice.triage_reason} />
            )}
            {invoice.document_type && (
              <DocumentTypeBadge type={invoice.document_type} />
            )}
          </div>
          <p className="text-sm text-graphite">{reasonText}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {isUnknownSender && canTrust && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => trustAndPromote.mutate()}
            loading={trustAndPromote.isPending}
            disabled={busy}
          >
            Trust sender + promote
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={() => promote.mutate()}
          loading={promote.isPending}
          disabled={busy}
        >
          Promote to review queue
        </Button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Read-only view — summary panel shown when the invoice is past review.
// ──────────────────────────────────────────────────────────────────────────

function ReadOnlyView({
  invoice,
  vendors,
  projects,
  onEdit,
  editBusy,
}: {
  invoice: Invoice;
  vendors: Vendor[];
  projects: Project[];
  onEdit: () => void;
  editBusy: boolean;
}) {
  const canEdit =
    invoice.status !== "posted_to_qbo" && invoice.status !== "rejected";
  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={onEdit}
            loading={editBusy}
            title={
              invoice.status === "approved"
                ? "Unapproves and reopens the form"
                : "Edit fields"
            }
          >
            <PencilSquareIcon className="h-4 w-4" />
            Edit
          </Button>
        </div>
      )}
      <InvoiceSummary invoice={invoice} vendors={vendors} projects={projects} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Action footer — split-button layout. Primary action depends on status.
// ──────────────────────────────────────────────────────────────────────────

interface FooterProps {
  invoice: Invoice;
  dirty: boolean;
  busy: boolean;
  qboConnected: boolean;
  forceEdit: boolean;
  showEditor: boolean;
  /** Tracks the full QBO post roundtrip, not just the HTTP request. */
  postingInFlight: boolean;
  onSave: () => void;
  onCancelEdit: () => void;
  onReject: () => void;
  onApprove: () => void;
  onApproveAndPost: () => void;
  onApproveAndAssign: () => void;
  onPost: () => void;
  onUnapprove: () => void;
  patchPending: boolean;
}

function ActionFooter(props: FooterProps) {
  const {
    invoice,
    dirty,
    busy,
    qboConnected,
    forceEdit,
    showEditor,
    postingInFlight,
    onSave,
    onCancelEdit,
    onReject,
    onApprove,
    onApproveAndPost,
    onApproveAndAssign,
    onPost,
    onUnapprove,
    patchPending,
  } = props;

  // Pick the primary action based on status
  let primary: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    disabledReason?: string;
    variant?: "primary" | "secondary";
  };
  let options: SplitButtonOption[] = [];

  if (invoice.status === "ready_for_review" || invoice.status === "extraction_failed") {
    primary = {
      label: "Approve",
      onClick: onApprove,
    };
    options = [
      {
        label: "Approve & Post to QBO",
        description: qboConnected
          ? "Sends to QuickBooks immediately"
          : "Connect QuickBooks in Settings first",
        onSelect: onApproveAndPost,
        disabled: !qboConnected,
        icon: <PaperAirplaneIcon className="h-4 w-4" />,
      },
      {
        label: "Approve & assign to…",
        description: "Approve and put it on someone's plate",
        onSelect: onApproveAndAssign,
        icon: <UserPlusIcon className="h-4 w-4" />,
      },
    ];
  } else if (invoice.status === "approved") {
    primary = {
      label: "Post to QBO",
      onClick: onPost,
      disabled: !qboConnected,
      disabledReason: "Connect QuickBooks in Settings first",
    };
    options = [
      {
        label: "Unapprove",
        description: "Revert to Needs Review for more edits",
        onSelect: onUnapprove,
        icon: <ArrowUturnLeftIcon className="h-4 w-4" />,
      },
    ];
  } else {
    // posted_to_qbo / rejected — no footer shown
    return null;
  }

  // We only reach this point in non-terminal states (ready_for_review,
  // extraction_failed, approved), so Reject is always allowed here.
  const rejectVisible = true;

  // When forceEdit is on for an already-approved invoice, show an edit-mode
  // footer instead — "Save and re-approve" etc.
  const isReapproving = forceEdit && invoice.status === "approved";

  // Inject Reject + Save draft + Cancel into the SplitButton dropdown so on
  // mobile a single full-width primary button is the only main control.
  // Desktop still surfaces them inline.
  const mobileExtraOptions: SplitButtonOption[] = [];
  if (showEditor) {
    mobileExtraOptions.push({
      label: dirty ? "Save draft" : "Saved",
      description: dirty
        ? "Persist edits without changing status"
        : "All changes already saved",
      onSelect: onSave,
      disabled: !dirty || patchPending,
      icon: <PencilSquareIcon className="h-4 w-4" />,
    });
  }
  if (rejectVisible) {
    mobileExtraOptions.push({
      label: "Reject",
      description: "Mark as rejected — captured in the audit log",
      onSelect: onReject,
      icon: <XCircleIcon className="h-4 w-4" />,
    });
  }
  if (isReapproving) {
    mobileExtraOptions.push({
      label: "Cancel edits",
      description: "Discard changes and return to read-only",
      onSelect: onCancelEdit,
      icon: <ArrowUturnLeftIcon className="h-4 w-4" />,
    });
  }
  const mobileOptions: SplitButtonOption[] =
    mobileExtraOptions.length === 0
      ? options
      : [
          ...options,
          { divider: true, label: "", onSelect: () => {} },
          ...mobileExtraOptions,
        ];

  return (
    <div className="sticky bottom-0 mt-6 md:mt-8 -mx-4 sm:-mx-6 md:-mx-8 px-4 sm:px-6 md:px-8 py-3 md:py-4 bg-stone border-t-2 border-navy z-20">
      {/* Status indicator */}
      <div className="text-xs text-slate-600 mb-2 sm:mb-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
        <div className="flex items-center gap-2">
          {showEditor ? (
            dirty ? (
              <>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber" />
                <span>Unsaved edits</span>
              </>
            ) : (
              <span>All changes saved.</span>
            )
          ) : (
            <span>
              Status:{" "}
              <span className="text-graphite font-medium">
                {invoice.status.replace(/_/g, " ")}
              </span>
            </span>
          )}
        </div>

        {/* Desktop button row — appears inline at sm+; mobile gets a single
            full-width SplitButton below. */}
        <div className="hidden sm:flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {isReapproving && (
            <Button variant="ghost" onClick={onCancelEdit}>
              Cancel
            </Button>
          )}
          {rejectVisible && (
            <Button
              variant="destructive"
              onClick={onReject}
              title="Reject (⌘+Shift+R)"
            >
              Reject
            </Button>
          )}
          {showEditor && (
            <Button
              variant="secondary"
              onClick={onSave}
              disabled={!dirty}
              loading={patchPending}
            >
              Save draft
            </Button>
          )}
          <SplitButton
            primaryLabel={
              postingInFlight && primary.label === "Post to QBO"
                ? "Posting to QBO…"
                : primary.label
            }
            onPrimary={primary.onClick}
            options={options}
            variant="primary"
            disabled={primary.disabled || busy || postingInFlight}
            title={primary.disabled ? primary.disabledReason : undefined}
            loading={(busy && !patchPending) || postingInFlight}
          />
        </div>
      </div>

      {/* Mobile: a single full-width SplitButton with secondary actions
          folded into the dropdown. */}
      <div className="sm:hidden">
        <SplitButton
          className="w-full"
          primaryLabel={
            postingInFlight && primary.label === "Post to QBO"
              ? "Posting to QBO…"
              : primary.label
          }
          onPrimary={primary.onClick}
          options={mobileOptions}
          variant="primary"
          disabled={primary.disabled || busy || postingInFlight}
          title={primary.disabled ? primary.disabledReason : undefined}
          loading={(busy && !patchPending) || postingInFlight}
        />
      </div>
    </div>
  );
}
