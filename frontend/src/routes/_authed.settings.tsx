import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/solid";
import {
  ArrowPathIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { PageHeader, SectionLabel } from "@/components/layout/AppShell";
import { useMobileAppBar } from "@/components/layout/MobileAppBar";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  useConnectQbo,
  useDisconnectQbo,
  useExpenseAccounts,
  useQboStatus,
  useSyncProjects,
  useSyncVendors,
  useUpdateQboSettings,
} from "@/lib/qbo";
import {
  FIELD_LABELS,
  groupByField,
  useCodingOptions,
  useCreateCodingOption,
  useDeleteCodingOption,
  usePatchCodingOption,
} from "@/lib/codingOptions";
import {
  useAddTrustedDomain,
  useRemoveTrustedDomain,
  useTrustedDomains,
} from "@/lib/trustedDomains";
import { useMe, ROLE_RANK } from "@/lib/users";
import type {
  CodingField,
  CodingOption,
  TrustedDomain,
} from "@/types";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authed/settings")({
  component: SettingsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    qbo_connected: search.qbo_connected as string | undefined,
    qbo_error: search.qbo_error as string | undefined,
  }),
});

function SettingsPage() {
  useMobileAppBar({ title: "Settings" });
  const search = useSearch({ from: "/_authed/settings" });
  const qboQuery = useQboStatus();
  const accountsQuery = useExpenseAccounts(qboQuery.data?.connected ?? false);
  const connect = useConnectQbo();
  const disconnect = useDisconnectQbo();
  const syncVendors = useSyncVendors();
  const syncProjects = useSyncProjects();
  const updateSettings = useUpdateQboSettings();

  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (search.qbo_connected) {
      setBanner({ kind: "ok", text: "Connected to QuickBooks Online." });
    } else if (search.qbo_error) {
      setBanner({ kind: "err", text: `QBO connection failed: ${search.qbo_error}` });
    }
  }, [search.qbo_connected, search.qbo_error]);

  const qbo = qboQuery.data;
  const connected = qbo?.connected ?? false;

  return (
    <>
      <PageHeader
        title="Portal"
        accent="Settings"
        subtitle="Connect accounting and tune extraction defaults."
      />

      {banner && (
        <div
          className={
            banner.kind === "ok"
              ? "mb-4 p-3 border-l-2 border-green-700 bg-green-50 text-sm text-green-900"
              : "mb-4 p-3 border-l-2 border-red-700 bg-red-50 text-sm text-red-900"
          }
        >
          {banner.text}
        </div>
      )}

      <div className="space-y-6">
        {/* QBO Connection */}
        <Card accent="top">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-2xl text-navy">QuickBooks Online</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Post approved bills and sync vendors + projects.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {connected ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-800">
                    <CheckCircleIcon className="h-5 w-5" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500">
                    <XCircleIcon className="h-5 w-5" />
                    Not connected
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardBody>
            {qboQuery.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
            {qboQuery.error && (
              <p className="text-sm text-red-700">
                {(qboQuery.error as Error).message}
              </p>
            )}
            {qbo && (
              <>
                {connected ? (
                  <div className="space-y-3">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <Field label="Realm ID" value={qbo.realm_id ?? "—"} mono />
                      <Field
                        label="Access token expires"
                        value={formatDateTime(qbo.expires_at)}
                      />
                      <Field
                        label="Refresh token expires"
                        value={formatDateTime(qbo.refresh_expires_at)}
                      />
                      <Field
                        label="Last vendor sync"
                        value={formatDateTime(qbo.last_vendor_sync_at)}
                      />
                      <Field
                        label="Last project sync"
                        value={formatDateTime(qbo.last_project_sync_at)}
                      />
                    </dl>
                    <div className="flex flex-wrap gap-2 pt-3 border-t border-stone/80">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => syncVendors.mutate()}
                        loading={syncVendors.isPending}
                      >
                        <ArrowPathIcon className="h-4 w-4" />
                        Sync vendors{" "}
                        {syncVendors.data && `(${syncVendors.data.count})`}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => syncProjects.mutate()}
                        loading={syncProjects.isPending}
                      >
                        <ArrowPathIcon className="h-4 w-4" />
                        Sync projects{" "}
                        {syncProjects.data && `(${syncProjects.data.count})`}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => disconnect.mutate()}
                        loading={disconnect.isPending}
                      >
                        Disconnect
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    onClick={() => connect.mutate()}
                    loading={connect.isPending}
                  >
                    Connect to QuickBooks Online
                  </Button>
                )}
              </>
            )}
          </CardBody>
        </Card>

        {/* Sync settings */}
        {connected && (
          <Card accent="left">
            <CardHeader>
              <h2 className="font-display text-2xl text-navy">Sync settings</h2>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Project source"
                  value={qbo?.project_source ?? "Customer"}
                  onChange={(e) =>
                    updateSettings.mutate({
                      project_source: e.target.value as "Customer" | "Class",
                    })
                  }
                  hint="Where project tags come from."
                >
                  <option value="Customer">Customers (with sub-customers)</option>
                  <option value="Class">Classes</option>
                </Select>

                <Select
                  label="Default expense account"
                  value={qbo?.default_expense_account_id ?? ""}
                  onChange={(e) =>
                    updateSettings.mutate({
                      default_expense_account_id: e.target.value || null,
                    })
                  }
                  hint="Used when posting bills with line items that have no account set."
                  disabled={accountsQuery.isLoading}
                >
                  <option value="">— not set —</option>
                  {accountsQuery.data?.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.account_type ? ` (${a.account_type})` : ""}
                    </option>
                  ))}
                </Select>
              </div>
            </CardBody>
          </Card>
        )}

        {/* AP coding options — admin/owner only. PMs see the dropdowns
            on the review screen; this is where the curated list lives. */}
        <APCodingSection />

        {/* Email-domain allowlist used by the triage workflow.
            Auto-populated from QBO vendor emails on every sync;
            admins can add manual entries for partners not in QBO. */}
        <TrustedDomainsSection />
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// AP Coding section — manages dropdown options for job/cost code/approver.
// Visible to admins+. Members see a brief notice instead.
// ──────────────────────────────────────────────────────────────────────────

const FIELDS: { key: CodingField; description: string }[] = [
  {
    key: "job_number",
    description: "Cambridge job codes (e.g. 25-11-04). Reusable across projects.",
  },
  {
    key: "cost_code",
    description: 'Cost classification (e.g. 01-520 "O"). Maps to internal accounting.',
  },
  {
    key: "approver",
    description: "Initials of whoever signs off the markup (e.g. jwh).",
  },
];

function APCodingSection() {
  const me = useMe();
  const role = me.data?.role ?? "member";
  const canManage = ROLE_RANK[role] >= ROLE_RANK.admin;

  const { data, isLoading } = useCodingOptions();
  const grouped = groupByField(
    (data?.options ?? []).filter((o) => o.active || canManage),
  );

  return (
    <Card accent="left">
      <CardHeader>
        <h2 className="font-display text-2xl text-navy">AP coding options</h2>
        <p className="text-xs text-slate-500 mt-1">
          Curated dropdowns shown when reviewing invoices. PMs can still
          enter custom values, but pre-defined options reduce typos and
          keep codes consistent.
        </p>
      </CardHeader>
      <CardBody>
        {!canManage && (
          <p className="text-sm text-slate-500">
            Admins manage these options. You'll see the dropdowns when reviewing
            invoices.
          </p>
        )}
        {canManage && (
          <div className="space-y-6">
            {FIELDS.map((f) => (
              <FieldGroup
                key={f.key}
                field={f.key}
                description={f.description}
                options={grouped[f.key]}
                loading={isLoading}
              />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function FieldGroup({
  field,
  description,
  options,
  loading,
}: {
  field: CodingField;
  description: string;
  options: CodingOption[];
  loading: boolean;
}) {
  const create = useCreateCodingOption();
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setAdding(false);
    setNewValue("");
    setNewLabel("");
    setError(null);
  }

  async function handleAdd() {
    setError(null);
    const v = newValue.trim();
    if (!v) {
      setError("Value is required");
      return;
    }
    try {
      await create.mutateAsync({
        field,
        value: v,
        label: newLabel.trim() || null,
      });
      reset();
    } catch (e) {
      setError((e as Error).message || "Failed to add");
    }
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <div>
          <SectionLabel>{FIELD_LABELS[field]}</SectionLabel>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
        {!adding && (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <PlusIcon className="h-4 w-4" />
            Add
          </Button>
        )}
      </div>

      {/* Add row */}
      {adding && (
        <div className="bg-stone/40 border border-amber/30 p-3 mb-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 items-end">
            <Input
              label="Value"
              labelTone="quiet"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder={field === "approver" ? "jwh" : "25-11-04"}
              className="font-mono"
              size="sm"
            />
            <Input
              label="Label (optional)"
              labelTone="quiet"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Lobby Renovation"
              size="sm"
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleAdd}
                loading={create.isPending}
                disabled={!newValue.trim()}
              >
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>
                Cancel
              </Button>
            </div>
          </div>
          {error && <p className="text-xs text-red-700">{error}</p>}
        </div>
      )}

      {/* Existing options */}
      {loading && (
        <p className="text-xs text-slate-500">Loading…</p>
      )}
      {!loading && options.length === 0 && !adding && (
        <p className="text-xs text-slate-500 italic">
          No options yet. Click Add to create one.
        </p>
      )}
      {options.length > 0 && (
        <ul className="divide-y divide-stone/60 border border-stone/60">
          {options.map((opt) => (
            <CodingOptionRow key={opt.id} option={opt} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CodingOptionRow({ option }: { option: CodingOption }) {
  const patch = usePatchCodingOption();
  const del = useDeleteCodingOption();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(option.value);
  const [l, setL] = useState(option.label ?? "");

  async function save() {
    await patch.mutateAsync({
      id: option.id,
      patch: { value: v.trim(), label: l.trim() || null },
    });
    setEditing(false);
  }

  async function toggleActive() {
    await patch.mutateAsync({
      id: option.id,
      patch: { active: !option.active },
    });
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Delete "${option.value}"? Existing invoices keep their value but PMs won't see it in the dropdown.`,
      )
    ) {
      return;
    }
    await del.mutateAsync(option.id);
  }

  if (editing) {
    return (
      <li className="px-3 py-2 bg-amber/5">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 items-end">
          <Input
            label="Value"
            labelTone="quiet"
            value={v}
            onChange={(e) => setV(e.target.value)}
            className="font-mono"
            size="sm"
          />
          <Input
            label="Label"
            labelTone="quiet"
            value={l}
            onChange={(e) => setL(e.target.value)}
            size="sm"
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={save}
              loading={patch.isPending}
              disabled={!v.trim()}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false);
                setV(option.value);
                setL(option.label ?? "");
              }}
            >
              <XMarkIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="px-3 py-2 flex items-center justify-between gap-3 hover:bg-stone/30">
      <div className="min-w-0 flex-1">
        <div className="font-mono text-sm text-graphite">
          {option.value}
          {!option.active && (
            <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-400">
              hidden
            </span>
          )}
        </div>
        {option.label && (
          <div className="text-xs text-slate-500 truncate">{option.label}</div>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={toggleActive}
          disabled={patch.isPending}
          className="text-[10px] uppercase tracking-wider px-2 py-1 text-slate-500 hover:text-navy disabled:opacity-50"
          title={option.active ? "Hide from dropdowns" : "Show in dropdowns"}
        >
          {option.active ? "Hide" : "Show"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="p-1.5 text-slate-500 hover:text-navy"
          aria-label="Edit"
        >
          <PencilIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={del.isPending}
          className="p-1.5 text-slate-500 hover:text-red-700 disabled:opacity-50"
          aria-label="Delete"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div
        className={
          mono
            ? "font-mono text-sm text-graphite"
            : "text-sm text-graphite"
        }
      >
        {value}
      </div>
    </div>
  );
}


// ──────────────────────────────────────────────────────────────────────────
// Trusted email domains — controls the allowlist used by the email
// triage workflow. The qbo_sync block is read-only (auto-managed),
// the manual block is editable.
// ──────────────────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<TrustedDomain["source"], string> = {
  qbo_sync: "From QuickBooks",
  manual: "Manual",
  promoted_from_triage: "Trusted from triage",
};


function TrustedDomainsSection() {
  const me = useMe();
  const role = me.data?.role ?? "member";
  const canManage = ROLE_RANK[role] >= ROLE_RANK.admin;

  // Skip the network call entirely for non-admin users — the API
  // would 403 and we don't want to render a confusing error.
  const query = useTrustedDomains({ enabled: canManage });
  const add = useAddTrustedDomain();
  const remove = useRemoveTrustedDomain();

  const [draftDomain, setDraftDomain] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const domains = query.data?.domains ?? [];
  const grouped = useMemo(() => {
    const buckets: Record<TrustedDomain["source"], TrustedDomain[]> = {
      qbo_sync: [],
      manual: [],
      promoted_from_triage: [],
    };
    for (const d of domains) buckets[d.source].push(d);
    return buckets;
  }, [domains]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!draftDomain.trim()) return;
    try {
      await add.mutateAsync({
        domain: draftDomain.trim(),
        notes: draftNotes.trim() || null,
      });
      setDraftDomain("");
      setDraftNotes("");
    } catch (exc) {
      setError(
        exc instanceof Error
          ? exc.message
          : "Could not add domain — try a different format.",
      );
    }
  };

  const handleRemove = async (id: string) => {
    setError(null);
    try {
      await remove.mutateAsync(id);
    } catch (exc) {
      setError(
        exc instanceof Error
          ? exc.message
          : "Could not remove this domain.",
      );
    }
  };

  return (
    <Card accent="left">
      <CardHeader>
        <h2 className="font-display text-2xl text-navy">
          Trusted email domains
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Senders from these domains skip the "Unknown sender" triage
          path. We auto-populate from your QuickBooks vendor emails on
          every sync — add manual entries here for partners not in QBO.
        </p>
      </CardHeader>
      <CardBody>
        {!canManage ? (
          <p className="text-sm text-slate-500">
            Admins manage the allowlist. The triage workflow uses these
            domains to decide whether a sender is recognised.
          </p>
        ) : query.isLoading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : (
          <div className="space-y-6">
            {error && (
              <div className="border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-900">
                {error}
              </div>
            )}

            {/* Manual + promoted-from-triage entries — editable */}
            <div className="space-y-3">
              <SectionLabel>Manual entries</SectionLabel>

              <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[180px]">
                  <Input
                    label="Domain or email"
                    value={draftDomain}
                    onChange={(e) => setDraftDomain(e.target.value)}
                    placeholder="vendor.com or hi@vendor.com"
                  />
                </div>
                <div className="flex-1 min-w-[180px]">
                  <Input
                    label="Note (optional)"
                    value={draftNotes}
                    onChange={(e) => setDraftNotes(e.target.value)}
                    placeholder="Subcontractor, partner, etc."
                  />
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={add.isPending}
                  disabled={!draftDomain.trim() || add.isPending}
                >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </form>

              {grouped.manual.length === 0 &&
              grouped.promoted_from_triage.length === 0 ? (
                <p className="text-sm text-slate-500 italic">
                  No manual entries yet. Use the form above to trust a
                  domain that isn't in QuickBooks.
                </p>
              ) : (
                <ul className="divide-y divide-stone/60">
                  {[...grouped.manual, ...grouped.promoted_from_triage].map(
                    (d) => (
                      <DomainRow
                        key={d.id}
                        domain={d}
                        onRemove={() => handleRemove(d.id)}
                        removing={remove.isPending}
                      />
                    ),
                  )}
                </ul>
              )}
            </div>

            {/* QBO-synced entries — read-only display */}
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <SectionLabel>From QuickBooks</SectionLabel>
                <span className="text-xs text-slate-400">
                  {grouped.qbo_sync.length} domains
                </span>
              </div>
              {grouped.qbo_sync.length === 0 ? (
                <p className="text-sm text-slate-500 italic">
                  No domains synced yet. Sync vendors from the
                  QuickBooks card above to populate.
                </p>
              ) : (
                <ul className="divide-y divide-stone/60">
                  {grouped.qbo_sync.map((d) => (
                    <DomainRow key={d.id} domain={d} readOnly />
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}


function DomainRow({
  domain,
  onRemove,
  removing,
  readOnly,
}: {
  domain: TrustedDomain;
  onRemove?: () => void;
  removing?: boolean;
  readOnly?: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      <span className="font-mono text-sm text-navy break-all">
        {domain.domain}
      </span>
      <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
        {SOURCE_LABEL[domain.source]}
      </span>
      {domain.notes && (
        <span className="text-xs text-slate-500 italic min-w-0 truncate">
          {domain.notes}
        </span>
      )}
      <span className="ml-auto flex items-center gap-3">
        {domain.added_by_email && (
          <span className="text-xs text-slate-400 truncate max-w-[16ch]">
            {domain.added_by_email}
          </span>
        )}
        {!readOnly && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={removing}
            className="text-slate-400 hover:text-red-700 transition-colors p-1 disabled:opacity-50"
            aria-label={`Remove ${domain.domain}`}
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
      </span>
    </li>
  );
}
