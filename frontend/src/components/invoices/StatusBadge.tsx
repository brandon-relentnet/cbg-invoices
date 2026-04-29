import { Badge } from "@/components/ui/Badge";
import type { InvoiceStatus } from "@/types";

/**
 * Each status's badge tone, label, and a leading status dot. The dot is the
 * fastest visual scan signal — its color tells you the overall state at a
 * glance even when the badge text is truncated. Tones use higher-contrast
 * borders + text colors than before so the chips read clearly on small
 * phone screens against the stone bg.
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
  // Just-arrived, awaiting extraction
  received: { tone: "slate", label: "Received", dotColor: "#64748b" },
  // Active extraction in progress
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
  pending: { tone: "slate", label: "Pending", dotColor: "#0b1b25" },
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
