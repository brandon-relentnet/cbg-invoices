import { Badge } from "@/components/ui/Badge";
import type { Invoice, InvoiceStatus } from "@/types";

/**
 * Primary status badge — the one-glance signal of where an invoice sits.
 *
 * The dot color is the fastest visual cue when the badge text is truncated.
 * Tones use higher-contrast borders + text colors so chips read clearly on
 * small phone screens against the stone bg.
 *
 * Pending (the old "in flight" status) was removed in favor of the queue's
 * Need Review / Assigned tabs — workflow stage now lives in the assignment
 * and active filter, not in a separate status value.
 */
const STATUS_CONFIG: Record<
  InvoiceStatus,
  {
    tone: React.ComponentProps<typeof Badge>["tone"];
    label: string;
    /** Hex used for the leading dot — overrides the default amber. */
    dotColor?: string;
    /** Pulse animation on the dot for in-flight states. */
    pulseDot?: boolean;
  }
> = {
  received: { tone: "slate", label: "Received", dotColor: "#64748b" },
  extracting: {
    tone: "blue",
    label: "Extracting",
    dotColor: "#1d4ed8",
    pulseDot: true,
  },
  extraction_failed: {
    tone: "red",
    label: "Extraction failed",
    dotColor: "#b91c1c",
  },
  ready_for_review: {
    tone: "amber",
    label: "Needs review",
    dotColor: "#c8923c",
  },
  approved: { tone: "green", label: "Approved", dotColor: "#15803d" },
  posted_to_qbo: { tone: "navy", label: "Posted", dotColor: "#c8923c" },
  rejected: { tone: "red", label: "Rejected", dotColor: "#7f1d1d" },
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const cfg =
    STATUS_CONFIG[status] ?? { tone: "slate" as const, label: status };
  return (
    <Badge tone={cfg.tone} dot dotColor={cfg.dotColor} pulseDot={cfg.pulseDot}>
      {cfg.label}
    </Badge>
  );
}

/**
 * Compact secondary indicator that adds context to an "approved" row inside
 * the merged Approved tab. Renders nothing for invoices in any other state.
 *
 *   - approved + qbo_post_error → red "Post failed"
 *   - approved + no bill_id     → muted "Pending post"
 *   - posted_to_qbo             → navy "#1234" (the QBO bill number,
 *                                  if present)
 *   - rejected with reason in notes → handled separately on the detail page,
 *                                     not here.
 */
export function PostStateBadge({ invoice }: { invoice: Pick<Invoice, "status" | "qbo_bill_id" | "qbo_post_error"> }) {
  if (invoice.status === "approved") {
    if (invoice.qbo_post_error) {
      return (
        <Badge tone="red" dot dotColor="#b91c1c">
          Post failed
        </Badge>
      );
    }
    if (!invoice.qbo_bill_id) {
      return (
        <Badge tone="slate" dot dotColor="#94a3b8">
          Pending post
        </Badge>
      );
    }
  }
  if (invoice.status === "posted_to_qbo" && invoice.qbo_bill_id) {
    return (
      <Badge tone="navy">
        <span className="font-mono">#{invoice.qbo_bill_id}</span>
      </Badge>
    );
  }
  return null;
}
