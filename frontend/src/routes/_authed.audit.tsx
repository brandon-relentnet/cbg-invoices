import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/AppShell";

export const Route = createFileRoute("/_authed/audit")({
  component: AuditPage,
});

function AuditPage() {
  return (
    <>
      <PageHeader title="Audit" accent="Log" subtitle="Every action on every invoice." />
      <div className="text-slate-600 text-sm">Audit log in phase 9.</div>
    </>
  );
}
