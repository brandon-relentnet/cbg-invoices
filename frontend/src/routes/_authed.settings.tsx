import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { useMe, ROLE_RANK } from "@/lib/users";
import type { CodingField, CodingOption } from "@/types";
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
