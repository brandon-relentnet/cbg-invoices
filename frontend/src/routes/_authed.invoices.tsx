import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/AppShell";

export const Route = createFileRoute("/_authed/invoices")({
  component: InvoicesPage,
});

function InvoicesPage() {
  return (
    <>
      <PageHeader
        title="Invoice"
        accent="Queue"
        subtitle="Review extracted invoices and post approved bills to QuickBooks."
      />
      <div className="text-slate-600 text-sm">Queue implementation in phase 5.</div>
    </>
  );
}
