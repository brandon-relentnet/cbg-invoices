import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/solid";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { PageHeader, SectionLabel } from "@/components/layout/AppShell";
import { useMobileAppBar } from "@/components/layout/MobileAppBar";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
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
      </div>
    </>
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
