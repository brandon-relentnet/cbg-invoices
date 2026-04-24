import { Link } from "@tanstack/react-router";
import { EnvelopeIcon, ArrowUpTrayIcon } from "@heroicons/react/24/solid";
import type { Invoice } from "@/types";
import { StatusBadge } from "@/components/invoices/StatusBadge";
import { formatCents, formatRelative } from "@/lib/format";

export function InvoiceRow({ invoice }: { invoice: Invoice }) {
  return (
    <tr className="border-b border-stone/60 hover:bg-amber/5 transition-colors">
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
          {invoice.vendor_name ?? <span className="text-slate-400 italic">Unknown</span>}
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
      <td className="px-4 py-3 text-sm text-right font-semibold text-navy">
        {formatCents(invoice.total_cents, invoice.currency)}
      </td>
      <td className="px-4 py-3 text-sm">
        <StatusBadge status={invoice.status} />
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          to="/invoices/$id"
          params={{ id: invoice.id }}
          className="text-sm font-semibold text-navy hover:text-amber"
        >
          Review →
        </Link>
      </td>
    </tr>
  );
}
