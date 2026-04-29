import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRightIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { PageHeader } from "@/components/layout/AppShell";
import { useMobileAppBar } from "@/components/layout/MobileAppBar";
import { useAuditLog } from "@/lib/audit";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { AuditLogEntry } from "@/types";

export const Route = createFileRoute("/_authed/audit")({
  component: AuditPage,
});

function AuditPage() {
  useMobileAppBar({ title: "Audit log" });
  const [actorFilter, setActorFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useAuditLog({
    actor_id: actorFilter || undefined,
    action: actionFilter || undefined,
    page,
    page_size: 50,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <>
      <PageHeader
        title="Audit"
        accent="Log"
        subtitle="Every status change, edit, and QBO call, in reverse chronological order."
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <label className="flex-1 min-w-[200px]">
          <span className="block text-xs font-bold uppercase tracking-widest text-amber mb-1">
            Actor ID
          </span>
          <input
            value={actorFilter}
            onChange={(e) => {
              setActorFilter(e.target.value);
              setPage(1);
            }}
            placeholder="Logto sub or 'system'"
            className="block w-full p-2 text-sm bg-white border border-slate-300 focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber"
          />
        </label>
        <label className="flex-1 min-w-[200px]">
          <span className="block text-xs font-bold uppercase tracking-widest text-amber mb-1">
            Action
          </span>
          <input
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            placeholder="e.g. invoice_approved"
            className="block w-full p-2 text-sm bg-white border border-slate-300 focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber"
          />
        </label>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p className="text-sm text-red-700">Failed to load audit log: {(error as Error).message}</p>
      )}

      {logs.length === 0 && !isLoading && (
        <div className="bg-white p-8 text-center border-t-4 border-amber">
          <p className="text-sm text-slate-600">No audit entries match.</p>
        </div>
      )}

      {logs.length > 0 && (
        <div className="bg-white border-t-4 border-amber">
          <ul className="divide-y divide-stone/60">
            {logs.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </ul>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-stone/60 text-sm">
              <span className="text-slate-500">
                Page {page} of {totalPages} — {total} entries
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 border border-slate-300 disabled:opacity-40 hover:border-navy"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1 border border-slate-300 disabled:opacity-40 hover:border-navy"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail =
    (entry.before && Object.keys(entry.before).length > 0) ||
    (entry.after && Object.keys(entry.after).length > 0);

  return (
    <li>
      <button
        type="button"
        onClick={() => hasDetail && setExpanded((e) => !e)}
        className={cn(
          "w-full px-4 py-3 flex items-start gap-3 text-left",
          hasDetail && "hover:bg-stone/40",
        )}
      >
        <div className="pt-0.5 text-slate-400">
          {hasDetail ? (
            expanded ? (
              <ChevronDownIcon className="h-4 w-4" />
            ) : (
              <ChevronRightIcon className="h-4 w-4" />
            )
          ) : (
            <span className="inline-block h-4 w-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-mono text-xs font-semibold text-navy">{entry.action}</span>
            <span className="text-xs text-slate-500">{formatDateTime(entry.created_at)}</span>
          </div>
          <div className="text-sm text-graphite mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-slate-600">
              {entry.actor_email ?? entry.actor_id}
            </span>
            {entry.invoice_id && (
              <>
                <span className="text-slate-300">·</span>
                <Link
                  to="/invoices/$id"
                  params={{ id: entry.invoice_id }}
                  className="text-xs font-mono text-navy hover:text-amber underline underline-offset-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  invoice {entry.invoice_id.slice(0, 8)}
                </Link>
              </>
            )}
          </div>
          {entry.message && (
            <div className="text-xs text-slate-500 mt-1 break-words">{entry.message}</div>
          )}
        </div>
      </button>
      {expanded && hasDetail && (
        <div className="px-4 pb-4 pl-11 grid grid-cols-1 md:grid-cols-2 gap-4">
          <DiffPane title="Before" data={entry.before} tone="red" />
          <DiffPane title="After" data={entry.after} tone="green" />
        </div>
      )}
    </li>
  );
}

function DiffPane({
  title,
  data,
  tone,
}: {
  title: string;
  data: Record<string, unknown> | null;
  tone: "red" | "green";
}) {
  const borderClass = tone === "red" ? "border-red-300" : "border-green-300";
  const labelClass = tone === "red" ? "text-red-700" : "text-green-700";
  return (
    <div className={cn("border bg-stone/40 p-3", borderClass)}>
      <div className={cn("text-xs font-bold uppercase tracking-widest mb-2", labelClass)}>
        {title}
      </div>
      {!data || Object.keys(data).length === 0 ? (
        <div className="text-xs text-slate-500 italic">(nothing)</div>
      ) : (
        <pre className="text-xs font-mono text-graphite whitespace-pre-wrap break-words overflow-x-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
