import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/AppShell";

export const Route = createFileRoute("/_authed/vendors")({
  component: VendorsPage,
});

function VendorsPage() {
  return (
    <>
      <PageHeader title="Vendors" accent="" subtitle="Synced from QuickBooks Online." />
      <div className="text-slate-600 text-sm">Vendor list in phase 7.</div>
    </>
  );
}
