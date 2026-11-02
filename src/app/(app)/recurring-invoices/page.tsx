import Link from 'next/link';
import { guardTenantPage, hasPermission } from '@/lib/auth';
import { can } from '@/lib/roles';
import { QueryCell, QueryHeaderCell } from '@/components/queries/query-cells';
import { recordQueriesFor } from '@/lib/queries/queries';
import { listRecurringInvoices } from '@/lib/invoices/recurring-queries';
import { buttonClasses } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { DisplayDate } from '@/components/date-format-provider';

export default async function RecurringInvoicesPage() {
    const { companyId, role } = await guardTenantPage('records:read');
    const canWrite = await hasPermission('accounts:write');
    const canRaiseQuery = can(role, 'queries:raise');

    const rows = await listRecurringInvoices(companyId);
    const queries = await recordQueriesFor(
        role,
        companyId,
        'recurring_invoice',
        rows.map((r) => r.id),
    );
    const showQueries = canRaiseQuery || queries.size > 0;

    return (
        <div>
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="font-display text-2xl font-semibold">
                        Recurring
                    </h1>
                    <p className="mt-1 text-muted">
                        Monthly retainers and schedules that create invoices
                        automatically.
                    </p>
                </div>
                {canWrite && (
                    <Link
                        href="/recurring-invoices/new"
                        className={buttonClasses('primary')}
                    >
                        New schedule
                    </Link>
                )}
            </div>

            <div className="mt-6">
                {rows.length === 0 ? (
                    <EmptyState
                        title="No recurring schedules yet"
                        description="Set up a monthly retainer so invoices create themselves on schedule."
                        actionHref={canWrite ? '/recurring-invoices/new' : undefined}
                        actionLabel={canWrite ? 'New schedule' : undefined}
                    />
                ) : (
                    <Table>
                        <THead>
                            <TR>
                                {showQueries ? <QueryHeaderCell /> : null}
                                <TH>Name</TH>
                                <TH>Client</TH>
                                <TH>Day</TH>
                                <TH>Next</TH>
                                <TH>On generate</TH>
                                <TH>Status</TH>
                                <TH className="text-right">Amount</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {rows.map((row) => (
                                <TR key={row.id}>
                                    {showQueries ? (
                                        <QueryCell
                                            kind="recurring_invoice"
                                            id={row.id}
                                            queries={queries.get(row.id)}
                                            canRaise={canRaiseQuery}
                                        />
                                    ) : null}
                                    <TD>
                                        <Link
                                            href={`/recurring-invoices/${row.id}`}
                                            className="font-medium text-foreground hover:underline"
                                        >
                                            {row.name}
                                        </Link>
                                    </TD>
                                    <TD>{row.clientName}</TD>
                                    <TD className="text-muted">
                                        {row.dayOfMonth}
                                    </TD>
                                    <TD className="text-muted">
                                        <DisplayDate value={row.nextRunOn} />
                                    </TD>
                                    <TD className="capitalize text-muted">
                                        {row.onGenerate}
                                    </TD>
                                    <TD>
                                        <span
                                            className={
                                                row.enabled
                                                    ? 'text-foreground'
                                                    : 'text-muted'
                                            }
                                        >
                                            {row.enabled ? 'Active' : 'Paused'}
                                        </span>
                                    </TD>
                                    <TD className="text-right font-medium">
                                        {row.grossFormatted}
                                    </TD>
                                </TR>
                            ))}
                        </TBody>
                    </Table>
                )}
            </div>
        </div>
    );
}
