import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { ClientQuoteStatusChart } from "@/components/clients/client-quote-status-chart";
import type { ClientOverviewData } from "@/lib/clients/overview";

export function ClientSummaryPanel({
  metrics,
  client,
  quoteStatusBreakdown,
}: {
  metrics: ClientOverviewData["metrics"];
  client: ClientOverviewData["client"];
  quoteStatusBreakdown: ClientOverviewData["quoteStatusBreakdown"];
}) {
  return (
    <div className="space-y-4">
      <ClientQuoteStatusChart breakdown={quoteStatusBreakdown} />

      <Card>
        <CardTitle>Pipeline quotes</CardTitle>
        <CardValue className="text-xl">{metrics.pipelineQuoteFormatted}</CardValue>
        <p className="mt-1 text-sm text-muted">
          {metrics.pipelineQuoteCount} quote{metrics.pipelineQuoteCount === 1 ? "" : "s"} (draft, sent, accepted)
        </p>
      </Card>

      <Card>
        <CardTitle>Active orders</CardTitle>
        <CardValue className="text-xl">{metrics.activeOrderFormatted}</CardValue>
        <p className="mt-1 text-sm text-muted">
          {metrics.activeOrderCount} active order{metrics.activeOrderCount === 1 ? "" : "s"}
        </p>
      </Card>

      <Card>
        <CardTitle>Outstanding</CardTitle>
        <CardValue className="text-xl">{metrics.outstandingFormatted}</CardValue>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Overdue</dt>
            <dd className="tabular-nums">{metrics.overdueFormatted}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Paid to date</dt>
            <dd className="tabular-nums">{metrics.paidToDateFormatted}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Invoices</dt>
            <dd className="tabular-nums">{metrics.invoiceCount}</dd>
          </div>
        </dl>
      </Card>

      {(client.companyName || client.email || client.addressLines || client.notes) ? (
        <Card>
          <CardTitle>Contact</CardTitle>
          <dl className="mt-3 space-y-2 text-sm">
            {client.companyName ? (
              <div>
                <dt className="text-xs text-muted">Company</dt>
                <dd>{client.companyName}</dd>
              </div>
            ) : null}
            {client.companyName ? (
              <div>
                <dt className="text-xs text-muted">Contact</dt>
                <dd>{client.name}</dd>
              </div>
            ) : null}
            {client.email ? (
              <div>
                <dt className="text-xs text-muted">Email</dt>
                <dd>{client.email}</dd>
              </div>
            ) : null}
            {client.addressLines ? (
              <div>
                <dt className="text-xs text-muted">Address</dt>
                <dd className="whitespace-pre-wrap">{client.addressLines}</dd>
              </div>
            ) : null}
            {client.notes ? (
              <div>
                <dt className="text-xs text-muted">Notes</dt>
                <dd className="whitespace-pre-wrap text-muted">{client.notes}</dd>
              </div>
            ) : null}
          </dl>
        </Card>
      ) : null}
    </div>
  );
}
