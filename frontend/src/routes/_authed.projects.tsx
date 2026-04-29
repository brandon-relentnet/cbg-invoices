import { createFileRoute } from "@tanstack/react-router";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { PageHeader } from "@/components/layout/AppShell";
import { useMobileAppBar } from "@/components/layout/MobileAppBar";
import { Button } from "@/components/ui/Button";
import { useProjects } from "@/lib/invoices";
import { useQboStatus, useSyncProjects } from "@/lib/qbo";
import { formatRelative } from "@/lib/format";

export const Route = createFileRoute("/_authed/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const { data, isLoading, error } = useProjects();
  const sync = useSyncProjects();
  const qbo = useQboStatus();

  useMobileAppBar({
    title: "Projects",
    action: qbo.data?.connected ? (
      <button
        type="button"
        onClick={() => sync.mutate()}
        disabled={sync.isPending}
        className="inline-flex items-center gap-1.5 min-h-[36px] px-3 text-xs font-bold uppercase tracking-wider text-navy hover:text-amber disabled:opacity-50"
        aria-label="Sync projects"
      >
        <ArrowPathIcon
          className={`h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`}
        />
        Sync
      </button>
    ) : null,
  });

  const lastSync = qbo.data?.last_project_sync_at
    ? formatRelative(qbo.data.last_project_sync_at)
    : "never";

  const projects = data?.projects ?? [];
  const source = qbo.data?.project_source ?? "Customer";

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={`Synced from QBO ${source.toLowerCase()}s — last ${lastSync}.`}
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

      {isLoading && <p className="text-sm text-slate-500">Loading projects…</p>}
      {error && (
        <p className="text-sm text-red-700">
          Failed to load projects: {(error as Error).message}
        </p>
      )}
      {!isLoading && !error && projects.length === 0 && (
        <div className="bg-white p-8 text-center border-t-4 border-amber">
          <p className="text-sm text-slate-600">
            No projects yet.{" "}
            {qbo.data?.connected
              ? "Click Sync to pull from QuickBooks."
              : "Connect QuickBooks on the Settings page first."}
          </p>
        </div>
      )}
      {projects.length > 0 && (
        <div className="bg-white border-t-4 border-amber">
          {/* Mobile: stacked rows */}
          <ul className="md:hidden divide-y divide-stone/60">
            {projects.map((p) => (
              <li key={p.id} className="px-4 py-3">
                <div className="font-semibold text-navy truncate">
                  {p.display_name}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>{p.qbo_type}</span>
                  <span className="font-mono">QBO #{p.qbo_id}</span>
                  <span>Synced {formatRelative(p.last_synced_at)}</span>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: full table */}
          <table className="hidden md:table w-full">
            <thead className="bg-stone/50">
              <tr className="border-b border-stone/60 text-xs font-bold uppercase tracking-widest text-amber">
                <th className="px-4 py-3 text-left">Project</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">QBO ID</th>
                <th className="px-4 py-3 text-right">Synced</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b border-stone/60">
                  <td className="px-4 py-3 text-sm font-semibold text-navy">
                    {p.display_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{p.qbo_type}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-500">{p.qbo_id}</td>
                  <td className="px-4 py-3 text-sm text-right text-slate-500">
                    {formatRelative(p.last_synced_at)}
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
