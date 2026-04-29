import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
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
import { PageHeader } from "@/components/layout/AppShell";
import { useMobileAppBar } from "@/components/layout/MobileAppBar";
import { Button } from "@/components/ui/Button";
import { SplitButton, type SplitButtonOption } from "@/components/ui/SplitButton";
import { StatusBadge } from "@/components/invoices/StatusBadge";
import { PdfViewer } from "@/components/invoices/PdfViewer";
import { ExtractedFieldsForm } from "@/components/invoices/ExtractedFieldsForm";
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
  useReextractInvoice,
  useRejectInvoice,
  useSendToPending,
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
// The review page has three macro-modes:
//   • "review"  — status=ready_for_review (or extraction_failed). Editable form.
//   • "pending" — status=pending. Read-only summary + Edit button. Can still
//                 be approved or reassigned.
//   • "locked"  — status=approved / posted_to_qbo / rejected. Read-only
//                 summary + Edit for approved (which unapproves it first).
// ──────────────────────────────────────────────────────────────────────────

type Mode = "review" | "pending" | "locked";

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
  const sendToPending = useSendToPending(id);
  const unapprove = useUnapproveInvoice(id);
  const assign = useAssignInvoice(id);
  const unassign = useUnassignInvoice(id);
  const reject = useRejectInvoice(id);
  const reextract = useReextractInvoice(id);

  const pending = useRef<InvoicePatchPayload | null>(null);
  const [dirty, setDirty] = useState(false);
  const [forceEdit, setForceEdit] = useState(false);

  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);

  // Assignment modals — one flow per action that needs an assignee.
  const [assignFlow, setAssignFlow] = useState<
    null | "approve-and-assign" | "pending-with-assign" | "reassign"
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
      invoice.status === "extracting"
    ) {
      return "review";
    }
    if (invoice.status === "pending") return "pending";
    return "locked";
  }, [invoice]);

  const showEditor = mode === "review" || forceEdit;

  // Stop the burst poll once the post resolves: either status flipped to
  // posted_to_qbo / pending / rejected / etc, OR qbo_post_error appeared.
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
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!invoice) return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (mode === "review") void handleApprove();
        else if (mode === "pending") void handleApprove();
        else if (invoice.status === "approved") void handlePost();
      } else if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        if (mode === "review" || mode === "pending") void handleApproveAndPost();
      } else if (e.shiftKey && (e.key === "R" || e.key === "r")) {
        e.preventDefault();
        setShowRejectModal(true);
      } else if (e.shiftKey && (e.key === "P" || e.key === "p")) {
        e.preventDefault();
        if (mode === "review") void handleSendToPending(null);
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
    sendToPending.isPending ||
    unapprove.isPending ||
    assign.isPending ||
    unassign.isPending ||
    reject.isPending ||
    reextract.isPending;

  async function flushDirty() {
    if (dirty && pending.current) {
      await patch.mutateAsync(pending.current);
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

  async function handleSendToPending(assignee: TeamMember | null) {
    await flushDirty();
    await sendToPending.mutateAsync(
      assignee
        ? {
            user_id: assignee.id,
            user_email: assignee.email,
            user_name: assignee.name,
          }
        : null,
    );
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
    // For APPROVED/PENDING, this unapproves first. For POSTED_TO_QBO, we don't
    // allow edits (no button rendered). For extraction_failed the form is
    // already editable.
    if (invoice?.status === "approved" || invoice?.status === "pending") {
      await handleUnapprove();
    } else {
      setForceEdit(true);
    }
  }

  const pickerTitle: Record<NonNullable<typeof assignFlow>, string> = {
    "approve-and-assign": "Approve & assign",
    "pending-with-assign": "Send to pending",
    reassign: "Reassign invoice",
  };
  const pickerDescription: Record<NonNullable<typeof assignFlow>, string> = {
    "approve-and-assign": "Approve this invoice and put it on someone else's plate.",
    "pending-with-assign":
      "Move this invoice to Pending — with or without an assignee to handle it.",
    reassign: "Move this invoice to a different team member.",
  };
  const pickerConfirm: Record<NonNullable<typeof assignFlow>, string> = {
    "approve-and-assign": "Approve & assign",
    "pending-with-assign": "Send to pending",
    reassign: "Reassign",
  };
  const pickerAllowEmpty = assignFlow === "pending-with-assign";

  async function onPickerSelect(member: TeamMember | null) {
    if (!assignFlow) return;
    if (assignFlow === "approve-and-assign") await handleApproveAndAssign(member);
    else if (assignFlow === "pending-with-assign") await handleSendToPending(member);
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
          {(mode === "review" || mode === "pending" || invoice.status === "approved") && (
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
        <div className="lg:col-span-3 h-[55vh] sm:h-[65vh] lg:h-[calc(100vh-16rem)] lg:min-h-[600px]">
          <PdfViewer invoiceId={id} downloadUrl={invoice.pdf_url ?? undefined} />
        </div>

        <div className="lg:col-span-2">
          {invoice.status === "extracting" || invoice.status === "received" ? (
            <div className="text-center py-16 bg-white border-l-2 border-amber/60">
              <div
                aria-hidden
                className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-navy border-r-transparent"
              />
              <p className="mt-3 text-sm text-slate-600">Extracting fields with Claude…</p>
            </div>
          ) : showEditor ? (
            <ExtractedFieldsForm
              invoice={invoice}
              vendors={vendorsQuery.data?.vendors ?? []}
              projects={projectsQuery.data?.projects ?? []}
              onChange={(p) => {
                pending.current = p;
                setDirty(true);
              }}
              disabled={false}
            />
          ) : (
            <ReadOnlyView
              invoice={invoice}
              vendors={vendorsQuery.data?.vendors ?? []}
              projects={projectsQuery.data?.projects ?? []}
              onEdit={handleEdit}
              onReassign={() => setAssignFlow("reassign")}
              editBusy={unapprove.isPending}
            />
          )}
        </div>
      </div>

      {/* Sticky action footer */}
      {(showEditor || mode === "pending" || invoice.status === "approved") && (
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
            pending.current = null;
          }}
          onReject={() => setShowRejectModal(true)}
          onApprove={handleApprove}
          onApproveAndPost={handleApproveAndPost}
          onApproveAndAssign={() => setAssignFlow("approve-and-assign")}
          onSendToPending={() => handleSendToPending(null)}
          onSendToPendingWithAssign={() => setAssignFlow("pending-with-assign")}
          onPost={handlePost}
          onUnapprove={handleUnapprove}
          patchPending={patch.isPending}
        />
      )}

      {/* Reject modal */}
      <AnimatePresence>
        {showRejectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-graphite/60 flex items-center justify-center z-50 p-4"
            onClick={() => setShowRejectModal(false)}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="bg-white w-full max-w-md border-t-4 border-amber max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <h2 className="font-display text-2xl text-navy">Reject invoice</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Provide a reason. This is saved to the audit log.
                </p>
                <textarea
                  autoFocus
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={4}
                  placeholder="e.g. Duplicate of invoice #INV-2025-12"
                  className="mt-4 block w-full p-3 border border-slate-300 bg-stone/50 text-sm focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber"
                />
              </div>
              <div className="px-6 py-4 bg-stone/50 flex items-center justify-end gap-2 border-t border-stone">
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Assignee picker (shared for all assign flows) */}
      <AssigneePicker
        open={assignFlow !== null}
        title={assignFlow ? pickerTitle[assignFlow] : ""}
        description={assignFlow ? pickerDescription[assignFlow] : undefined}
        confirmLabel={assignFlow ? pickerConfirm[assignFlow] : undefined}
        allowEmpty={pickerAllowEmpty}
        loading={busy}
        onClose={() => setAssignFlow(null)}
        onSelect={onPickerSelect}
      />
    </>
  );
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
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// Read-only view — summary panel shown when the invoice is past review.
// ──────────────────────────────────────────────────────────────────────────

function ReadOnlyView({
  invoice,
  vendors,
  projects,
  onEdit,
  onReassign,
  editBusy,
}: {
  invoice: Invoice;
  vendors: Vendor[];
  projects: Project[];
  onEdit: () => void;
  onReassign: () => void;
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
                : invoice.status === "pending"
                  ? "Reopens the form for edits"
                  : "Edit fields"
            }
          >
            <PencilSquareIcon className="h-4 w-4" />
            Edit
          </Button>
          {invoice.status === "pending" && !invoice.assigned_to_id && (
            <Button variant="ghost" size="sm" onClick={onReassign}>
              <UserPlusIcon className="h-4 w-4" />
              Assign to…
            </Button>
          )}
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
  onSendToPending: () => void;
  onSendToPendingWithAssign: () => void;
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
    onSendToPending,
    onSendToPendingWithAssign,
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
      { divider: true, label: "", onSelect: () => {} },
      {
        label: "Send to Pending",
        description: "Park for later — no assignee",
        onSelect: onSendToPending,
        icon: <ClockIcon className="h-4 w-4" />,
      },
      {
        label: "Send to Pending (with assignee)",
        description: "Park and assign to someone specific",
        onSelect: onSendToPendingWithAssign,
        icon: <UserPlusIcon className="h-4 w-4" />,
      },
    ];
  } else if (invoice.status === "pending") {
    primary = { label: "Approve", onClick: onApprove };
    options = [
      {
        label: "Approve & Post to QBO",
        description: qboConnected ? undefined : "Connect QuickBooks in Settings first",
        onSelect: onApproveAndPost,
        disabled: !qboConnected,
        icon: <PaperAirplaneIcon className="h-4 w-4" />,
      },
      {
        label: "Send back to Review",
        description: "Re-open the editable form",
        onSelect: onUnapprove,
        icon: <ArrowUturnLeftIcon className="h-4 w-4" />,
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
        label: "Send to Pending",
        description: "Park instead of posting",
        onSelect: onSendToPending,
        icon: <ClockIcon className="h-4 w-4" />,
      },
      {
        label: "Unapprove",
        description: "Revert to Needs Review",
        onSelect: onUnapprove,
        icon: <ArrowUturnLeftIcon className="h-4 w-4" />,
      },
    ];
  } else {
    // posted_to_qbo / rejected — no footer shown
    return null;
  }

  const rejectVisible =
    invoice.status !== "posted_to_qbo" && invoice.status !== "rejected";

  // When forceEdit is on for an already-approved invoice, show an edit-mode
  // footer instead — "Save and re-approve" etc.
  const isReapproving = forceEdit && invoice.status === "approved";

  return (
    <div className="sticky bottom-0 mt-6 md:mt-8 -mx-4 sm:-mx-6 md:-mx-8 px-4 sm:px-6 md:px-8 py-3 md:py-4 bg-stone border-t-2 border-navy flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 z-20">
      <div className="flex items-center gap-3 text-xs text-slate-600">
        {showEditor ? (
          dirty ? (
            <span>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber align-middle mr-2" />
              Unsaved edits
            </span>
          ) : (
            "All changes saved."
          )
        ) : (
          "Status: " + invoice.status.replace(/_/g, " ")
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
        {isReapproving && (
          <Button variant="ghost" onClick={onCancelEdit}>
            Cancel
          </Button>
        )}
        {rejectVisible && (
          <Button variant="destructive" onClick={onReject} title="Reject (⌘+Shift+R)">
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
  );
}
