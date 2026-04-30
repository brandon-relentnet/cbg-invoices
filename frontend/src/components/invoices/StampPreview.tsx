/**
 * Live HTML preview of the AP coding stamp that gets baked into the PDF
 * at QBO post time. Mirrors the reportlab-drawn version: navy outline,
 * amber title band, mono values.
 *
 * Renders empty fields as muted "—" so the user can see the layout while
 * filling in values. When all four are filled it lights up navy text, so
 * "ready to stamp" reads at a glance.
 *
 * Designed to be absolute-positioned over the top-right corner of the
 * PdfViewer area — purely a UX preview, no actual PDF mutation here.
 */
import type { Invoice } from "@/types";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

interface Props {
  invoice: Pick<Invoice, "job_number" | "cost_code" | "coding_date" | "approver">;
  className?: string;
}

export function StampPreview({ invoice, className }: Props) {
  const ready =
    !!invoice.job_number?.trim() &&
    !!invoice.cost_code?.trim() &&
    !!invoice.coding_date &&
    !!invoice.approver?.trim();

  return (
    <div
      className={cn(
        "w-[220px] bg-white border-2 shadow-lg select-none transition-colors",
        ready ? "border-navy" : "border-slate-300",
        className,
      )}
      aria-label="AP coding stamp preview"
      title="Preview of the stamp that will be baked into the QBO attachment"
    >
      {/* Title band */}
      <div className="bg-amber px-2 py-1 flex items-center justify-between text-[9px] font-bold tracking-widest text-navy">
        <span>CAMBRIDGE</span>
        <span>AP CODING</span>
      </div>

      {/* Field rows */}
      <div className="px-2 py-1.5 space-y-0.5">
        <Row label="JOB #" value={invoice.job_number} ready={ready} />
        <Row label="COST CD" value={invoice.cost_code} ready={ready} />
        <Row
          label="DATE"
          value={
            invoice.coding_date
              ? formatDate(invoice.coding_date)
              : null
          }
          ready={ready}
        />
        <Row label="APPROVED" value={invoice.approver} ready={ready} />
      </div>

      {/* Footer hint when incomplete */}
      {!ready && (
        <div className="px-2 py-1 border-t border-slate-200 text-[8px] uppercase tracking-wider text-slate-500">
          Fill all 4 to enable post
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  ready,
}: {
  label: string;
  value: string | null | undefined;
  ready: boolean;
}) {
  const filled = !!(value && String(value).trim());
  return (
    <div className="flex items-baseline gap-2 text-[10px]">
      <span className="font-bold text-navy w-[58px] flex-shrink-0">{label}</span>
      <span
        className={cn(
          "font-mono truncate",
          filled
            ? ready
              ? "text-navy"
              : "text-graphite"
            : "text-slate-300",
        )}
      >
        {filled ? value : "—"}
      </span>
    </div>
  );
}
