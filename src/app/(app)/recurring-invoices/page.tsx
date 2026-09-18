import Link from 'next/link';
import { guardTenantPage, hasPermission } from '@/lib/auth';
import { listRecurringInvoices } from '@/lib/invoices/recurring-queries';
import { buttonClasses } from '@/components/ui/button';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';

export default async function RecurringInvoicesPage() {
    const { companyId } = await guardTenantPage('accounts:read');
    const canWrite = await hasPermission('accounts:write');

    const rows = await listRecurringInvoices(companyId);

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
                    <p className="text-sm text-muted">
                        No recurring schedules yet.
                    </p>
                ) : (
                    <Table>
                        <THead>
                            <TR>
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
                                        {row.nextRunOn ?? '—'}
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
