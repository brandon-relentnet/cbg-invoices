import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ExclamationTriangleIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/invoices/StatusBadge";
import { PdfViewer } from "@/components/invoices/PdfViewer";
import { ExtractedFieldsForm } from "@/components/invoices/ExtractedFieldsForm";
import {
  useApproveInvoice,
  useInvoice,
  useProjects,
  usePatchInvoice,
  useReextractInvoice,
  useRejectInvoice,
  useRetryQbo,
  useVendors,
  type InvoicePatchPayload,
} from "@/lib/invoices";
import { useQboStatus } from "@/lib/qbo";

export const Route = createFileRoute("/_authed/invoices_/$id")({
  component: InvoiceDetailPage,
});

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const invoiceQuery = useInvoice(id);
  const vendorsQuery = useVendors();
  const projectsQuery = useProjects();
  const qboQuery = useQboStatus();

  const patch = usePatchInvoice(id);
  const approve = useApproveInvoice(id);
  const reject = useRejectInvoice(id);
  const reextract = useReextractInvoice(id);
  const retryQbo = useRetryQbo(id);

  const pending = useRef<InvoicePatchPayload | null>(null);
  const [dirty, setDirty] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);

  // Keyboard shortcuts: ⌘+Enter approve, ⌘+R reject (actually Cmd+Shift+R to avoid browser reload)
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "Enter") {
        e.preventDefault();
        void handleApprove();
      }
      if (e.shiftKey && (e.key === "R" || e.key === "r")) {
        e.preventDefault();
        setShowRejectModal(true);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceQuery.data]);

  if (invoiceQuery.isLoading) {
    return (
      <div className="py-20 text-center text-slate-500 text-sm">Loading invoice…</div>
    );
  }
  if (invoiceQuery.error || !invoiceQuery.data) {
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

  const invoice = invoiceQuery.data;
  const editable =
    invoice.status === "ready_for_review" ||
    invoice.status === "extraction_failed" ||
    invoice.status === "approved";
  const qboConnected = qboQuery.data?.connected ?? false;

  async function handleSave() {
    if (!pending.current) return;
    await patch.mutateAsync(pending.current);
    setDirty(false);
  }

  async function handleApprove() {
    if (dirty && pending.current) await patch.mutateAsync(pending.current);
    setDirty(false);
    await approve.mutateAsync();
  }

  async function handleReject() {
    if (!rejectReason.trim()) return;
    await reject.mutateAsync(rejectReason.trim());
    setShowRejectModal(false);
    setRejectReason("");
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

      {/* Error banners */}
      {invoice.status === "extraction_failed" && (
        <div className="mb-4 p-4 bg-red-50 border-l-2 border-red-700 flex items-start gap-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-red-900">Extraction failed</div>
            {invoice.extraction_error && (
              <div className="text-xs text-red-800 mt-1 font-mono break-all">
                {invoice.extraction_error}
              </div>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => reextract.mutate()}
            loading={reextract.isPending}
          >
            <ArrowPathIcon className="h-4 w-4" />
            Re-extract
          </Button>
        </div>
      )}
      {invoice.status === "approved" && invoice.qbo_post_error && (
        <div className="mb-4 p-4 bg-amber/10 border-l-2 border-amber flex items-start gap-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-amber flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-navy">QBO posting failed</div>
            <div className="text-xs text-graphite mt-1 font-mono break-all">
              {invoice.qbo_post_error}
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => retryQbo.mutate()}
            loading={retryQbo.isPending}
          >
            Retry post to QBO
          </Button>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 h-[calc(100vh-16rem)] min-h-[600px]">
          <PdfViewer invoiceId={id} downloadUrl={invoice.pdf_url} />
        </div>

        <div className="lg:col-span-2">
          {invoice.status === "extracting" ? (
            <div className="text-center py-16">
              <div
                aria-hidden
                className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-navy border-r-transparent"
              />
              <p className="mt-3 text-sm text-slate-600">Extracting fields with Claude…</p>
            </div>
          ) : (
            <ExtractedFieldsForm
              invoice={invoice}
              vendors={vendorsQuery.data?.vendors ?? []}
              projects={projectsQuery.data?.projects ?? []}
              onChange={(p) => {
                pending.current = p;
                setDirty(true);
              }}
              disabled={!editable || invoice.status === "posted_to_qbo"}
            />
          )}
        </div>
      </div>

      {/* Sticky action footer */}
      {editable && (
        <div className="sticky bottom-0 mt-8 -mx-8 px-8 py-4 bg-stone border-t-2 border-navy flex items-center justify-between gap-3 z-20">
          <div className="text-xs text-slate-600">
            {dirty ? "You have unsaved edits." : "All changes saved."}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              onClick={() => setShowRejectModal(true)}
              title="Reject (⌘+Shift+R)"
            >
              Reject
            </Button>
            <Button
              variant="secondary"
              onClick={handleSave}
              disabled={!dirty}
              loading={patch.isPending}
            >
              Save draft
            </Button>
            <Button
              variant="primary"
              onClick={handleApprove}
              disabled={!qboConnected || invoice.status === "posted_to_qbo"}
              loading={approve.isPending || patch.isPending}
              title={!qboConnected ? "Connect QBO in Settings first" : "Approve & post (⌘+Enter)"}
            >
              Approve & Post to QBO
            </Button>
          </div>
        </div>
      )}

      {/* Reject modal */}
      <AnimatePresence>
        {showRejectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-graphite/60 flex items-center justify-center z-50"
            onClick={() => setShowRejectModal(false)}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="bg-white w-full max-w-md mx-4 border-t-4 border-amber"
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
    </>
  );
}
