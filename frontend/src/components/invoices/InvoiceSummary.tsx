/**
 * Read-only summary panel that replaces the editable form once an invoice
 * has moved past `ready_for_review`. Shows the key fields at a glance, what
 * happened (approved by X, posted as Bill #Y), and exposes an Edit button
 * to reopen the form.
 */
import type { Invoice, Project, Vendor } from "@/types";
import { SectionLabel } from "@/components/layout/AppShell";
import { formatCents, formatDate } from "@/lib/format";

interface Props {
  invoice: Invoice;
  vendors: Vendor[];
  projects: Project[];
}

export function InvoiceSummary({ invoice, vendors, projects }: Props) {
  const vendor = vendors.find((v) => v.id === invoice.vendor_id);
  const project = projects.find((p) => p.id === invoice.project_id);
  return (
    <div className="space-y-4">
      {/* ---------- Top card (mirrors the editable form's summary card) ---------- */}
      <div className="bg-navy text-stone p-5 border-l-2 border-amber relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-50 pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-amber mb-1">
              Vendor
            </div>
            <div className="font-display text-xl leading-tight truncate">
              {vendor?.display_name || invoice.vendor_name || (
                <span className="text-stone/50 italic">Unassigned</span>
              )}
            </div>
            {invoice.invoice_number && (
              <div className="text-xs text-stone/60 font-mono mt-1">
                Invoice #{invoice.invoice_number}
              </div>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-amber mb-1">
              Total
            </div>
            <div className="font-display text-2xl leading-none tabular-nums">
              {formatCents(invoice.total_cents, invoice.currency)}
            </div>
          </div>
        </div>
      </div>

      <DetailCard title="Details">
        <DataRow label="Vendor">
          {vendor?.display_name || invoice.vendor_name || "—"}
        </DataRow>
        <DataRow label="Project">{project?.display_name || "—"}</DataRow>
        <DataRow label="Invoice #">{invoice.invoice_number || "—"}</DataRow>
        <DataRow label="PO #">{invoice.po_number || "—"}</DataRow>
        <DataRow label="Invoice date">{formatDate(invoice.invoice_date)}</DataRow>
        <DataRow label="Due date">{formatDate(invoice.due_date)}</DataRow>
        <DataRow label="Subtotal">
          <span className="tabular-nums">
            {formatCents(invoice.subtotal_cents, invoice.currency)}
          </span>
        </DataRow>
        <DataRow label="Tax">
          <span className="tabular-nums">
            {formatCents(invoice.tax_cents, invoice.currency)}
          </span>
        </DataRow>
        <DataRow label="Total">
          <span className="tabular-nums font-semibold">
            {formatCents(invoice.total_cents, invoice.currency)}
          </span>
        </DataRow>
      </DetailCard>

      {invoice.line_items.length > 0 && (
        <DetailCard title="Line items">
          <div className="border border-slate-200 overflow-x-auto -mx-1 sm:mx-0">
            <div className="min-w-[420px]">
              <div className="grid grid-cols-12 gap-0 bg-slate-50 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <div className="col-span-7 px-2 py-1.5">Description</div>
                <div className="col-span-2 px-2 py-1.5 text-right">Qty</div>
                <div className="col-span-3 px-2 py-1.5 text-right">Amount</div>
              </div>
              <div className="divide-y divide-slate-100">
                {invoice.line_items.map((li, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-0 px-2 py-1.5 text-sm"
                  >
                    <div className="col-span-7 truncate">
                      {li.description || <span className="text-slate-400">—</span>}
                    </div>
                    <div className="col-span-2 text-right tabular-nums text-slate-600">
                      {li.quantity ?? "—"}
                    </div>
                    <div className="col-span-3 text-right tabular-nums">
                      {formatCents(li.amount_cents, invoice.currency)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DetailCard>
      )}

      {invoice.notes && (
        <DetailCard title="Notes">
          <p className="text-sm text-graphite whitespace-pre-wrap">{invoice.notes}</p>
        </DetailCard>
      )}
    </div>
  );
}

function DetailCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white p-4 border-l-2 border-amber/60">
      <header className="mb-3 pb-2 border-b border-slate-100">
        <SectionLabel>{title}</SectionLabel>
      </header>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function DataRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 gap-4 py-1 text-sm">
      <dt className="text-xs text-slate-500 uppercase tracking-wider self-center">
        {label}
      </dt>
      <dd className="col-span-2 text-graphite">{children}</dd>
    </div>
  );
}
