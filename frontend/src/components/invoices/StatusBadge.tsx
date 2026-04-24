import { Badge } from "@/components/ui/Badge";
import type { InvoiceStatus } from "@/types";

const STATUS_CONFIG: Record<
  InvoiceStatus,
  {
    tone: React.ComponentProps<typeof Badge>["tone"];
    label: string;
    dot?: boolean;
  }
> = {
  received: { tone: "slate", label: "Received" },
  extracting: { tone: "blue", label: "Extracting" },
  extraction_failed: { tone: "red", label: "Extraction failed" },
  ready_for_review: { tone: "amber", label: "Needs review" },
  // Dot distinguishes Pending from Received — both use slate tone
  pending: { tone: "slate", label: "Pending", dot: true },
  approved: { tone: "green", label: "Approved" },
  posted_to_qbo: { tone: "navy", label: "Posted to QBO" },
  rejected: { tone: "red", label: "Rejected" },
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { tone: "slate" as const, label: status };
  return (
    <Badge tone={cfg.tone} dot={cfg.dot}>
      {cfg.label}
    </Badge>
  );
}
