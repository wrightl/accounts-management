import { Download } from "lucide-react";
import { guardTenantPage, hasPermission } from '@/lib/auth';
import { financialYearStartDate, monthName, todayIsoDate } from '@/lib/dates';
import { InvoiceCutoverCard } from '@/components/reports/invoice-cutover-card';
import { PeriodLockCard } from '@/components/reports/period-lock-card';
import { ReportPeriodForm } from '@/components/reports/report-period-form';
import Link from 'next/link';
import { getBankReconciledThrough, getLastWeeklyClose } from '@/lib/close/checklist';
import {
    defaultReportPeriod,
    getAgedReceivables,
    getExpenseByCategory,
    getIncomeByMonth,
    getProfitAndLoss,
    getVatSummary,
} from '@/lib/reports/queries';
import {
    profitAndLossBasisNote,
    shouldShowVat,
} from '@/lib/reports/vat-display';
import { getCompanySettings } from '@/lib/settings/queries';
import { getEntitlements } from '@/lib/billing/entitlements';
import { Statement } from '@/components/ui/statement';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { DisplayDate } from "@/components/date-format-provider";
import { PageHeader } from '@/components/ui/page-header';
import { LinkMenuButton } from '@/components/ui/link-menu-button';
import { Callout } from "@/components/ui/callout";

export default async function ReportsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const { companyId } = await guardTenantPage('filing:read');
    const canExport = await hasPermission('reports:export');
    const canLock = await hasPermission('books:lock');
    const canOpenClose = await hasPermission('accounts:read');
    const sp = await searchParams;

    const [defaults, company] = await Promise.all([
        defaultReportPeriod(companyId),
        getCompanySettings(companyId),
    ]);
    const from = sp.from ?? defaults.from;
    const to = sp.to ?? defaults.to;
    const yearEndLabel = monthName(company.financialYearEndMonth);
    const today = todayIsoDate();
    const dayBefore = (iso: string) => {
        const d = new Date(`${iso}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
    };
    const lastYearEnd = dayBefore(
        financialYearStartDate(company.financialYearEndMonth, today),
    );

    const [pnl, aged, byMonth, byCategory, vat, bank, lastClose, entitlements] = await Promise.all([
        getProfitAndLoss(companyId, from, to),
        getAgedReceivables(companyId),
        getIncomeByMonth(companyId, from, to),
        getExpenseByCategory(companyId, from, to),
        getVatSummary(companyId, from, to),
        getBankReconciledThrough(companyId),
        getLastWeeklyClose(companyId),
        getEntitlements(companyId),
    ]);
    const showVat = shouldShowVat({
        vatRegistered: company.vatRegistered,
        hasVatOnDocuments: vat.hasVatOnDocuments,
    });
    const exVat = showVat ? ' (ex VAT)' : '';

    return (
        <div>
            <PageHeader
                title="Reports"
                description={
                    showVat
                        ? 'Profit, VAT and money owed for any dates you choose.'
                        : 'Profit and money owed for any dates you choose.'
                }
                actions={
                    canExport ? (
                        <LinkMenuButton
                            label="Download"
                            icon={<Download className="h-4 w-4" />}
                            items={[
                                {
                                    key: 'year-end-pack',
                                    label: 'Accountant pack (on Year end)',
                                    href: '/year-end',
                                },
                                ...(entitlements.vatExport && showVat
                                    ? [
                                          {
                                              key: 'vat-csv',
                                              label: 'VAT summary (CSV)',
                                              href: `/api/reports/vat?from=${from}&to=${to}`,
                                          },
                                      ]
                                    : []),
                            ]}
                        />
                    ) : null
                }
            />

            <ReportPeriodForm from={from} to={to} />
            {from > to ? (
                <Callout className="mt-2">
                    The From date is after the To date, so every figure below is
                    zero. Swap the dates to see the period.
                </Callout>
            ) : null}
            <p className="mt-2 text-sm text-muted">
                Your financial year ends in {yearEndLabel}.{' '}
                {bank.reconciledThrough ? (
                    <>
                        The bank is reconciled to{' '}
                        <DisplayDate value={bank.reconciledThrough} />.
                    </>
                ) : (
                    'No bank transactions are imported yet.'
                )}{' '}
                {lastClose ? (
                    <>
                        {canOpenClose ? (
                            <Link href="/close" className="underline">
                                Last weekly close
                            </Link>
                        ) : (
                            'Last weekly close'
                        )}{' '}
                        <DisplayDate value={lastClose.closedAt} />
                        {lastClose.closedByName ? ` by ${lastClose.closedByName}` : ''}.
                    </>
                ) : null}
            </p>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <Statement
                    title="Profit and loss"
                    help={
                        <>
                            <p>{profitAndLossBasisNote(showVat)}</p>
                            <p>
                                Expenses include items a founder paid and was paid back
                                for, by the date they were spent. The bank transfers
                                that paid them back aren&apos;t counted again.
                            </p>
                        </>
                    }
                    rows={[
                        {
                            label: `Income (invoiced${showVat ? ', ex VAT' : ''})`,
                            value: pnl.incomeFormatted,
                            note:
                                pnl.creditNotePence > 0
                                    ? `After ${pnl.creditNoteFormatted} of credit notes`
                                    : undefined,
                        },
                        { label: 'Other income', value: pnl.otherIncomeFormatted },
                        {
                            label: `Expenses${exVat}`,
                            value: pnl.expenseFormatted,
                            note:
                                pnl.writeOffPence > 0
                                    ? `Includes ${pnl.writeOffFormatted} of invoices written off`
                                    : undefined,
                        },
                    ]}
                    total={{ label: 'Profit / (loss)', value: pnl.profitFormatted }}
                />

                {showVat ? (
                    <Statement
                        title="VAT"
                        aside={vat.vatNumber ? `VAT ${vat.vatNumber}` : undefined}
                        help={vat.note ? <p>{vat.note}</p> : undefined}
                        rows={[
                            {
                                label: 'VAT on sales',
                                value: vat.vatOnSalesFormatted,
                                note:
                                    vat.creditNoteVatPence > 0
                                        ? `After ${vat.creditNoteVatFormatted} on credit notes`
                                        : undefined,
                            },
                            { label: 'VAT on purchases', value: vat.vatOnPurchasesFormatted },
                        ]}
                        total={{ label: 'Net VAT', value: vat.netVatFormatted }}
                    />
                ) : null}

                <Statement
                    title="Money owed to you"
                    rows={[
                        { label: 'Not due yet', value: aged.current },
                        { label: '1 to 30 days late', value: aged.d30 },
                        { label: '31 to 60 days late', value: aged.d60 },
                        { label: 'Over 60 days late', value: aged.d90 },
                    ]}
                />
            </div>

            <PeriodLockCard
                lockedThrough={company.booksLockedThrough}
                suggestedDate={lastYearEnd}
                maxDate={dayBefore(today)}
                canLock={canLock}
            />

            <InvoiceCutoverCard
                cutover={company.invoiceCutoverDate}
                maxDate={today}
                canEdit={canLock}
                vatRegistered={company.vatRegistered}
            />

            <section className="mt-10 grid gap-8 lg:grid-cols-2">
                <div>
                    <h2 className="mb-3 font-display text-lg font-semibold">
                        Income by month{exVat}
                    </h2>
                    <Table>
                        <THead>
                            <TR>
                                <TH>Month</TH>
                                <TH className="text-right">Total</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {byMonth.length === 0 ? (
                                <TR>
                                    <TD colSpan={2} className="text-muted">
                                        No income in period
                                    </TD>
                                </TR>
                            ) : (
                                byMonth.map((r) => (
                                    <TR key={r.month}>
                                        <TD>{r.month}</TD>
                                        <TD className="text-right">
                                            {r.totalFormatted}
                                        </TD>
                                    </TR>
                                ))
                            )}
                        </TBody>
                    </Table>
                </div>
                <div>
                    <h2 className="mb-3 font-display text-lg font-semibold">
                        Expenses by category
                    </h2>
                    <Table>
                        <THead>
                            <TR>
                                <TH>Category</TH>
                                <TH className="text-right">Total</TH>
                            </TR>
                        </THead>
                        <TBody>
                            {byCategory.length === 0 ? (
                                <TR>
                                    <TD colSpan={2} className="text-muted">
                                        No expenses in period
                                    </TD>
                                </TR>
                            ) : (
                                byCategory.map((r) => (
                                    <TR key={r.category}>
                                        <TD>{r.category}</TD>
                                        <TD className="text-right">
                                            {r.totalFormatted}
                                        </TD>
                                    </TR>
                                ))
                            )}
                        </TBody>
                    </Table>
                </div>
            </section>
        </div>
    );
}
