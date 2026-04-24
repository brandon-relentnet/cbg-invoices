import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/AppShell";

export const Route = createFileRoute("/_authed/invoices/$id")({
  component: InvoiceDetailPage,
});

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  return (
    <>
      <PageHeader title="Review" accent="Invoice" subtitle={`ID: ${id}`} />
      <div className="text-slate-600 text-sm">Review interface in phase 5.</div>
    </>
  );
}
