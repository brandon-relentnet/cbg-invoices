import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/AppShell";

export const Route = createFileRoute("/_authed/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  return (
    <>
      <PageHeader title="Projects" subtitle="Jobs / customers synced from QuickBooks." />
      <div className="text-slate-600 text-sm">Project list in phase 7.</div>
    </>
  );
}
