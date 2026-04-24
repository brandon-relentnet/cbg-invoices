import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/AppShell";
import { InvoiceQueue } from "@/components/invoices/InvoiceQueue";

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
      <InvoiceQueue />
    </>
  );
}
