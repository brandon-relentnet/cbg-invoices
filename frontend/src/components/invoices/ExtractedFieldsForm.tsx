import { useEffect, useMemo, useState } from "react";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import type { Invoice, LineItem, Project, Vendor } from "@/types";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { SectionLabel } from "@/components/layout/AppShell";
import { formatDollarsInput, parseDollars } from "@/lib/format";
import type { InvoicePatchPayload } from "@/lib/invoices";

interface Props {
  invoice: Invoice;
  vendors: Vendor[];
  projects: Project[];
  onChange: (patch: InvoicePatchPayload) => void;
  disabled?: boolean;
}

interface FormState {
  vendor_id: string;
  vendor_name: string;
  project_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  po_number: string;
  subtotal: string;
  tax: string;
  total: string;
  currency: string;
  notes: string;
  line_items: LineItemDraft[];
}

interface LineItemDraft {
  description: string;
  quantity: string;
  unit_price: string;
  amount: string;
}

function fromInvoice(inv: Invoice): FormState {
  return {
    vendor_id: inv.vendor_id ?? "",
    vendor_name: inv.vendor_name ?? "",
    project_id: inv.project_id ?? "",
    invoice_number: inv.invoice_number ?? "",
    invoice_date: inv.invoice_date ?? "",
    due_date: inv.due_date ?? "",
    po_number: inv.po_number ?? "",
    subtotal: formatDollarsInput(inv.subtotal_cents),
    tax: formatDollarsInput(inv.tax_cents),
    total: formatDollarsInput(inv.total_cents),
    currency: inv.currency,
    notes: inv.notes ?? "",
    line_items: inv.line_items.map((li) => ({
      description: li.description ?? "",
      quantity: li.quantity !== null ? String(li.quantity) : "",
      unit_price: formatDollarsInput(li.unit_price_cents),
      amount: formatDollarsInput(li.amount_cents),
    })),
  };
}

function toPatch(s: FormState): InvoicePatchPayload {
  const line_items: LineItem[] = s.line_items
    .filter((li) => li.description.trim() || li.amount)
    .map((li) => ({
      description: li.description,
      quantity: li.quantity ? Number(li.quantity) : null,
      unit_price_cents: parseDollars(li.unit_price),
      amount_cents: parseDollars(li.amount),
    }));
  return {
    vendor_id: s.vendor_id || null,
    vendor_name: s.vendor_name || null,
    project_id: s.project_id || null,
    invoice_number: s.invoice_number || null,
    invoice_date: s.invoice_date || null,
    due_date: s.due_date || null,
    po_number: s.po_number || null,
    subtotal_cents: parseDollars(s.subtotal),
    tax_cents: parseDollars(s.tax),
    total_cents: parseDollars(s.total),
    currency: s.currency || "USD",
    notes: s.notes || null,
    line_items,
  };
}

export function ExtractedFieldsForm({ invoice, vendors, projects, onChange, disabled }: Props) {
  const [form, setForm] = useState<FormState>(() => fromInvoice(invoice));

  // Re-sync from server when the invoice id changes (new invoice opened)
  // and when status flips from extracting→ready_for_review (fresh extraction finished)
  useEffect(() => {
    setForm(fromInvoice(invoice));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.id, invoice.status]);

  // Propagate changes
  useEffect(() => {
    onChange(toPatch(form));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((s) => ({ ...s, [key]: value }));

  const updateLine = (idx: number, key: keyof LineItemDraft, value: string) =>
    setForm((s) => {
      const next = [...s.line_items];
      next[idx] = { ...next[idx], [key]: value };
      return { ...s, line_items: next };
    });

  const addLine = () =>
    setForm((s) => ({
      ...s,
      line_items: [...s.line_items, { description: "", quantity: "", unit_price: "", amount: "" }],
    }));

  const removeLine = (idx: number) =>
    setForm((s) => ({ ...s, line_items: s.line_items.filter((_, i) => i !== idx) }));

  const vendorOptions = useMemo(
    () => [...vendors].sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [vendors],
  );
  const projectOptions = useMemo(
    () =>
      [...projects]
        .filter((p) => p.active)
        .sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [projects],
  );

  return (
    <div className="space-y-6">
      <fieldset disabled={disabled} className="space-y-5">
        <section>
          <SectionLabel>Vendor</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Vendor (QBO)"
              value={form.vendor_id}
              onChange={(e) => update("vendor_id", e.target.value)}
            >
              <option value="">— pick a vendor —</option>
              {vendorOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.display_name}
                </option>
              ))}
            </Select>
            <Input
              label="Extracted vendor name"
              value={form.vendor_name}
              onChange={(e) => update("vendor_name", e.target.value)}
              hint="Used for reference; not sent to QBO"
            />
          </div>
        </section>

        <section>
          <SectionLabel>Project</SectionLabel>
          <Select
            label="Project (QBO customer / class)"
            value={form.project_id}
            onChange={(e) => update("project_id", e.target.value)}
          >
            <option value="">— no project —</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </Select>
        </section>

        <section>
          <SectionLabel>Invoice details</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Invoice #"
              value={form.invoice_number}
              onChange={(e) => update("invoice_number", e.target.value)}
            />
            <Input
              label="PO #"
              value={form.po_number}
              onChange={(e) => update("po_number", e.target.value)}
            />
            <Input
              label="Invoice date"
              type="date"
              value={form.invoice_date}
              onChange={(e) => update("invoice_date", e.target.value)}
            />
            <Input
              label="Due date"
              type="date"
              value={form.due_date}
              onChange={(e) => update("due_date", e.target.value)}
            />
          </div>
        </section>

        <section>
          <SectionLabel>Amounts (USD)</SectionLabel>
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Subtotal"
              inputMode="decimal"
              value={form.subtotal}
              onChange={(e) => update("subtotal", e.target.value)}
              placeholder="0.00"
            />
            <Input
              label="Tax"
              inputMode="decimal"
              value={form.tax}
              onChange={(e) => update("tax", e.target.value)}
              placeholder="0.00"
            />
            <Input
              label="Total"
              inputMode="decimal"
              value={form.total}
              onChange={(e) => update("total", e.target.value)}
              placeholder="0.00"
            />
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>Line items</SectionLabel>
            <Button variant="ghost" size="sm" onClick={addLine} type="button">
              <PlusIcon className="h-4 w-4" />
              Add line
            </Button>
          </div>
          {form.line_items.length === 0 && (
            <p className="text-xs text-slate-500 italic">No line items extracted.</p>
          )}
          <div className="space-y-2">
            {form.line_items.map((li, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-6">
                  <input
                    value={li.description}
                    placeholder="Description"
                    onChange={(e) => updateLine(idx, "description", e.target.value)}
                    className="block w-full p-2 text-sm border border-slate-300 bg-stone/50 focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    value={li.quantity}
                    placeholder="Qty"
                    inputMode="decimal"
                    onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                    className="block w-full p-2 text-sm border border-slate-300 bg-stone/50 focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    value={li.unit_price}
                    placeholder="Unit $"
                    inputMode="decimal"
                    onChange={(e) => updateLine(idx, "unit_price", e.target.value)}
                    className="block w-full p-2 text-sm border border-slate-300 bg-stone/50 focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber"
                  />
                </div>
                <div className="col-span-1">
                  <input
                    value={li.amount}
                    placeholder="Amt $"
                    inputMode="decimal"
                    onChange={(e) => updateLine(idx, "amount", e.target.value)}
                    className="block w-full p-2 text-sm border border-slate-300 bg-stone/50 focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(idx)}
                  aria-label="Remove line item"
                  className="col-span-1 p-2 text-slate-400 hover:text-red-700"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionLabel>Notes</SectionLabel>
          <textarea
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={3}
            className="block w-full p-3 border border-slate-300 bg-stone/50 text-graphite text-sm focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber"
          />
        </section>
      </fieldset>
    </div>
  );
}
