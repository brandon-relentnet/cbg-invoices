import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/AppShell";

export const Route = createFileRoute("/_authed/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="QuickBooks connection and defaults." />
      <div className="text-slate-600 text-sm">Settings implementation in phase 7.</div>
    </>
  );
}
