import { createFileRoute } from "@tanstack/react-router";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { PageHeader } from "@/components/layout/AppShell";
import { useMobileAppBar } from "@/components/layout/MobileAppBar";
import { Button } from "@/components/ui/Button";
import { useVendors } from "@/lib/invoices";
import { useQboStatus, useSyncVendors } from "@/lib/qbo";
import { formatRelative } from "@/lib/format";

export const Route = createFileRoute("/_authed/vendors")({
  component: VendorsPage,
});

function VendorsPage() {
  const { data, isLoading, error } = useVendors();
  const sync = useSyncVendors();
  const qbo = useQboStatus();

  useMobileAppBar({
    title: "Vendors",
    action: qbo.data?.connected ? (
      <button
        type="button"
        onClick={() => sync.mutate()}
        disabled={sync.isPending}
        className="inline-flex items-center gap-1.5 min-h-[36px] px-3 text-xs font-bold uppercase tracking-wider text-navy hover:text-amber disabled:opacity-50"
        aria-label="Sync vendors"
      >
        <ArrowPathIcon
          className={`h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`}
        />
        Sync
      </button>
    ) : null,
  });

  const lastSync = qbo.data?.last_vendor_sync_at
    ? formatRelative(qbo.data.last_vendor_sync_at)
    : "never";

  const vendors = data?.vendors ?? [];

  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle={`Synced from QuickBooks — last ${lastSync}.`}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => sync.mutate()}
            loading={sync.isPending}
            disabled={!qbo.data?.connected}
            title={qbo.data?.connected ? "Sync from QBO" : "Connect QBO in Settings first"}
          >
            <ArrowPathIcon className="h-4 w-4" />
            Sync
          </Button>
        }
      />

      {isLoading && <p className="text-sm text-slate-500">Loading vendors…</p>}
      {error && (
        <p className="text-sm text-red-700">Failed to load vendors: {(error as Error).message}</p>
      )}
      {!isLoading && !error && vendors.length === 0 && (
        <div className="bg-white p-8 text-center border-t-4 border-amber">
          <p className="text-sm text-slate-600">
            No vendors yet.{" "}
            {qbo.data?.connected
              ? "Click Sync to pull from QuickBooks."
              : "Connect QuickBooks on the Settings page first."}
          </p>
        </div>
      )}
      {vendors.length > 0 && (
        <div className="bg-white border-t-4 border-amber">
          {/* Mobile: stacked rows */}
          <ul className="md:hidden divide-y divide-stone/60">
            {vendors.map((v) => (
              <li key={v.id} className="px-4 py-3">
                <div className="font-semibold text-navy truncate">
                  {v.display_name}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  {v.email && <span>{v.email}</span>}
                  {v.qbo_id && (
                    <span className="font-mono">QBO #{v.qbo_id}</span>
                  )}
                  <span>Synced {formatRelative(v.last_synced_at)}</span>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: full table */}
          <table className="hidden md:table w-full">
            <thead className="bg-stone/50">
              <tr className="border-b border-stone/60 text-xs font-bold uppercase tracking-widest text-amber">
                <th className="px-4 py-3 text-left">Vendor</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">QBO ID</th>
                <th className="px-4 py-3 text-right">Synced</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id} className="border-b border-stone/60">
                  <td className="px-4 py-3 text-sm font-semibold text-navy">
                    {v.display_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{v.email ?? "—"}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-500">{v.qbo_id ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-right text-slate-500">
                    {formatRelative(v.last_synced_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
