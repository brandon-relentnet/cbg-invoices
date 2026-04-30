import { useEffect, useMemo, useState } from "react";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import type { Invoice, LineItem, Project, Vendor } from "@/types";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { StampPreview } from "@/components/invoices/StampPreview";
import { formatCents, formatDollarsInput, parseDollars } from "@/lib/format";
import type { InvoicePatchPayload } from "@/lib/invoices";
import { groupByField, useCodingOptions } from "@/lib/codingOptions";

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
  // Cambridge AP coding markup
  job_number: string;
  cost_code: string;
  coding_date: string;
  approver: string;
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
    job_number: inv.job_number ?? "",
    cost_code: inv.cost_code ?? "",
    coding_date: inv.coding_date ?? "",
    approver: inv.approver ?? "",
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
    job_number: s.job_number || null,
    cost_code: s.cost_code || null,
    coding_date: s.coding_date || null,
    approver: s.approver || null,
  };
}

export function ExtractedFieldsForm({ invoice, vendors, projects, onChange, disabled }: Props) {
  const [form, setForm] = useState<FormState>(() => fromInvoice(invoice));
  const codingOptionsQuery = useCodingOptions();
  const codingGroups = useMemo(
    () => groupByField(codingOptionsQuery.data?.options),
    [codingOptionsQuery.data],
  );

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
      line_items: [
        ...s.line_items,
        { description: "", quantity: "", unit_price: "", amount: "" },
      ],
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

  const selectedVendor = vendorOptions.find((v) => v.id === form.vendor_id);
  const extractedDiffers =
    form.vendor_name.trim().length > 0 &&
    selectedVendor &&
    form.vendor_name.trim().toLowerCase() !== selectedVendor.display_name.trim().toLowerCase();

  // Totals computation for summary card (uses cents)
  const totalCents = parseDollars(form.total);
  const subtotalCents = parseDollars(form.subtotal);
  const taxCents = parseDollars(form.tax);
  const sumLinesCents = form.line_items.reduce(
    (acc, li) => acc + (parseDollars(li.amount) ?? 0),
    0,
  );

  // Sanity check: if subtotal + tax != total, show a warning
  const mathIsOff =
    subtotalCents !== null &&
    taxCents !== null &&
    totalCents !== null &&
    Math.abs(subtotalCents + taxCents - totalCents) > 1;

  return (
    <div className="space-y-4">
      {/* ---------- Summary card ---------- */}
      <div className="bg-navy text-stone p-5 border-l-2 border-amber relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-50 pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-amber mb-1">
              Vendor
            </div>
            <div className="font-display text-xl leading-tight truncate">
              {selectedVendor?.display_name ||
                form.vendor_name ||
                <span className="text-stone/50 italic">Unassigned</span>}
            </div>
            {form.invoice_number && (
              <div className="text-xs text-stone/60 font-mono mt-1">
                Invoice #{form.invoice_number}
              </div>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-amber mb-1">
              Total
            </div>
            <div className="font-display text-2xl leading-none tabular-nums">
              {formatCents(totalCents, form.currency)}
            </div>
          </div>
        </div>
      </div>

      <fieldset disabled={disabled} className="space-y-4 min-w-0">
        {/* ---------- Cambridge AP coding markup ----------
            Highest priority section — these fields drive the project +
            cost-code allocation in QBO and live audit. Sometimes auto-
            extracted from the PDF markup, sometimes typed manually. */}
        <FormSection title="Cambridge coding">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
              <Combobox
                label="Job no."
                labelTone="quiet"
                value={form.job_number}
                onChange={(v) => update("job_number", v)}
                options={codingGroups.job_number}
                placeholder="e.g. 25-11-04"
                name="job_number"
                disabled={disabled}
              />
              <Combobox
                label="Cost code"
                labelTone="quiet"
                value={form.cost_code}
                onChange={(v) => update("cost_code", v)}
                options={codingGroups.cost_code}
                placeholder='e.g. 01-520 "O"'
                name="cost_code"
                disabled={disabled}
              />
              <Input
                label="Coding date"
                labelTone="quiet"
                type="date"
                value={form.coding_date}
                onChange={(e) => update("coding_date", e.target.value)}
                disabled={disabled}
              />
              <Combobox
                label="Approver"
                labelTone="quiet"
                value={form.approver}
                onChange={(v) => update("approver", v)}
                options={codingGroups.approver}
                placeholder="e.g. jwh"
                name="approver"
                disabled={disabled}
              />
            </div>
            {/* Live preview of the stamp that gets baked into the QBO
                attachment at post time. Hidden on small screens to keep
                form input ergonomics clean; the preview is auxiliary,
                not blocking. */}
            <div className="hidden lg:block flex-shrink-0">
              <StampPreview
                invoice={{
                  job_number: form.job_number,
                  cost_code: form.cost_code,
                  coding_date: form.coding_date || null,
                  approver: form.approver,
                }}
              />
            </div>
          </div>
        </FormSection>

        {/* ---------- Assignment (Vendor + Project) ---------- */}
        <FormSection title="Assignment">
          <Select
            label="Vendor"
            labelTone="quiet"
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
          {extractedDiffers && (
            <p className="text-xs text-slate-500 mt-1">
              Extracted as <span className="font-semibold text-graphite">{form.vendor_name}</span>
            </p>
          )}
          <div className="mt-3">
            <Select
              label="Project"
              labelTone="quiet"
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
          </div>
        </FormSection>

        {/* ---------- Invoice metadata ---------- */}
        <FormSection title="Invoice details">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Invoice #"
              labelTone="quiet"
              value={form.invoice_number}
              onChange={(e) => update("invoice_number", e.target.value)}
            />
            <Input
              label="PO #"
              labelTone="quiet"
              value={form.po_number}
              onChange={(e) => update("po_number", e.target.value)}
            />
            <Input
              label="Invoice date"
              labelTone="quiet"
              type="date"
              value={form.invoice_date}
              onChange={(e) => update("invoice_date", e.target.value)}
            />
            <Input
              label="Due date"
              labelTone="quiet"
              type="date"
              value={form.due_date}
              onChange={(e) => update("due_date", e.target.value)}
            />
          </div>
        </FormSection>

        {/* ---------- Amounts ---------- */}
        <FormSection title="Amounts">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Subtotal"
              labelTone="quiet"
              inputMode="decimal"
              value={form.subtotal}
              onChange={(e) => update("subtotal", e.target.value)}
              placeholder="0.00"
              className="tabular-nums text-right"
            />
            <Input
              label="Tax"
              labelTone="quiet"
              inputMode="decimal"
              value={form.tax}
              onChange={(e) => update("tax", e.target.value)}
              placeholder="0.00"
              className="tabular-nums text-right"
            />
            <Input
              label="Total"
              labelTone="quiet"
              inputMode="decimal"
              value={form.total}
              onChange={(e) => update("total", e.target.value)}
              placeholder="0.00"
              className="tabular-nums text-right font-semibold text-navy"
            />
          </div>
          {mathIsOff && (
            <p className="mt-2 text-xs text-amber-700 bg-amber/10 border-l-2 border-amber px-2 py-1">
              Subtotal + tax doesn't match total. Check the extraction or adjust as needed.
            </p>
          )}
        </FormSection>

        {/* ---------- Line items (table) ---------- */}
        <FormSection
          title="Line items"
          action={
            <Button variant="ghost" size="sm" onClick={addLine} type="button">
              <PlusIcon className="h-4 w-4" />
              Add line
            </Button>
          }
        >
          {form.line_items.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">No line items extracted.</p>
          ) : (
            <div className="border border-slate-200 overflow-x-auto -mx-1 sm:mx-0">
              <div className="min-w-[460px]">
              {/* Header row */}
              <div className="grid grid-cols-12 gap-0 bg-slate-50 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <div className="col-span-6 px-2 py-1.5">Description</div>
                <div className="col-span-2 px-2 py-1.5 text-right">Qty</div>
                <div className="col-span-2 px-2 py-1.5 text-right">Unit $</div>
                <div className="col-span-2 px-2 py-1.5 text-right">Amount</div>
              </div>
              {/* Data rows */}
              <div className="divide-y divide-slate-100">
                {form.line_items.map((li, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-0 items-stretch group hover:bg-amber/5"
                  >
                    <div className="col-span-6 relative">
                      <input
                        value={li.description}
                        placeholder="Description"
                        onChange={(e) => updateLine(idx, "description", e.target.value)}
                        className="block w-full px-2 py-2 text-sm bg-transparent border-0 focus:outline-none focus:bg-amber/10 placeholder:text-slate-400"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        value={li.quantity}
                        placeholder="—"
                        inputMode="decimal"
                        onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                        className="block w-full px-2 py-2 text-sm bg-transparent border-0 focus:outline-none focus:bg-amber/10 text-right tabular-nums placeholder:text-slate-300"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        value={li.unit_price}
                        placeholder="—"
                        inputMode="decimal"
                        onChange={(e) => updateLine(idx, "unit_price", e.target.value)}
                        className="block w-full px-2 py-2 text-sm bg-transparent border-0 focus:outline-none focus:bg-amber/10 text-right tabular-nums placeholder:text-slate-300"
                      />
                    </div>
                    <div className="col-span-2 relative">
                      <input
                        value={li.amount}
                        placeholder="0.00"
                        inputMode="decimal"
                        onChange={(e) => updateLine(idx, "amount", e.target.value)}
                        className="block w-full px-2 py-2 text-sm bg-transparent border-0 focus:outline-none focus:bg-amber/10 text-right tabular-nums font-medium placeholder:text-slate-300 pr-7"
                      />
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        aria-label="Remove line item"
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-red-700 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Footer: sum of line items */}
              {form.line_items.length > 1 && (
                <div className="grid grid-cols-12 bg-slate-50 border-t border-slate-200 text-xs">
                  <div className="col-span-10 px-2 py-1.5 text-right font-medium text-slate-500 uppercase tracking-wider text-[10px]">
                    Lines total
                  </div>
                  <div className="col-span-2 px-2 py-1.5 text-right tabular-nums font-semibold text-graphite">
                    {formatCents(sumLinesCents, form.currency)}
                  </div>
                </div>
              )}
              </div>
            </div>
          )}
        </FormSection>

        {/* ---------- Notes ---------- */}
        <FormSection title="Notes">
          <textarea
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={3}
            placeholder="Internal notes — shown in QBO as private memo."
            className="block w-full p-3 border border-slate-300 bg-stone/50 text-graphite text-sm focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber placeholder:text-slate-400"
          />
        </FormSection>
      </fieldset>
    </div>
  );
}

// ---------- Section wrapper ----------

function FormSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white p-4 border-l-2 border-amber/60">
      <header className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          {title}
        </h3>
        {action}
      </header>
      {children}
    </section>
  );
}
