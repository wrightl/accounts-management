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
import { Card, CardTitle, CardValue } from '@/components/ui/card';
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
                    <>
                        <p>
                            {showVat
                                ? 'Accrual P&L (invoiced income net of VAT), VAT summary and receivables for any date range.'
                                : 'Accrual P&L and receivables for any date range.'}{' '}
                            The accountant pack is now on{' '}
                            <Link href="/year-end" className="underline">
                                Year end
                            </Link>
                            .
                        </p>
                        <p className="mt-2 text-sm text-foreground">
                            {bank.reconciledThrough
                                ? <>Books up to date to <DisplayDate value={bank.reconciledThrough} /> (bank reconciled)</>
                                : 'No bank transactions imported yet'}
                            {lastClose
                                ? <> · last weekly close <DisplayDate value={lastClose.closedAt} />{lastClose.closedByName ? ` by ${lastClose.closedByName}` : ''}</>
                                : ''}
                            {canOpenClose ? (
                                <>
                                    {' · '}
                                    <Link href="/close" className="underline">
                                        Weekly close
                                    </Link>
                                </>
                            ) : null}
                        </p>
                    </>
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
                Financial year ends in {yearEndLabel}.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardTitle>Income (invoiced{showVat ? ', ex VAT' : ''})</CardTitle>
                    <CardValue>{pnl.incomeFormatted}</CardValue>
                    {pnl.creditNotePence > 0 ? (
                        <p className="mt-1 text-xs text-muted">
                            After {pnl.creditNoteFormatted} of credit notes
                        </p>
                    ) : null}
                </Card>
                <Card>
                    <CardTitle>Other income</CardTitle>
                    <CardValue>{pnl.otherIncomeFormatted}</CardValue>
                </Card>
                <Card>
                    <CardTitle>Expenses{exVat}</CardTitle>
                    <CardValue>{pnl.expenseFormatted}</CardValue>
                    {pnl.writeOffPence > 0 ? (
                        <p className="mt-1 text-xs text-muted">
                            Includes {pnl.writeOffFormatted} of invoices written off
                        </p>
                    ) : null}
                </Card>
                <Card>
                    <CardTitle>Profit / (loss)</CardTitle>
                    <CardValue>{pnl.profitFormatted}</CardValue>
                </Card>
            </div>
            <p className="mt-3 text-sm text-muted">
                {profitAndLossBasisNote(showVat)}
            </p>

            {showVat ? (
                <section className="mt-10">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <h2 className="font-display text-lg font-semibold">
                            VAT summary
                        </h2>
                        {vat.vatNumber ? (
                            <p className="text-sm text-muted">VAT {vat.vatNumber}</p>
                        ) : null}
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <Card>
                            <CardTitle>VAT on sales</CardTitle>
                            <CardValue className="text-xl">
                                {vat.vatOnSalesFormatted}
                            </CardValue>
                            {vat.creditNoteVatPence > 0 ? (
                                <p className="mt-1 text-xs text-muted">
                                    After {vat.creditNoteVatFormatted} on credit
                                    notes
                                </p>
                            ) : null}
                        </Card>
                        <Card>
                            <CardTitle>VAT on purchases</CardTitle>
                            <CardValue className="text-xl">
                                {vat.vatOnPurchasesFormatted}
                            </CardValue>
                        </Card>
                        <Card>
                            <CardTitle>Net VAT</CardTitle>
                            <CardValue className="text-xl">
                                {vat.netVatFormatted}
                            </CardValue>
                        </Card>
                    </div>
                    <p className="mt-3 text-sm text-muted">{vat.note}</p>
                </section>
            ) : null}

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

            <section className="mt-10">
                <h2 className="font-display text-lg font-semibold">
                    Aged receivables
                </h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <Card>
                        <CardTitle>Current</CardTitle>
                        <CardValue className="text-xl">
                            {aged.current}
                        </CardValue>
                    </Card>
                    <Card>
                        <CardTitle>1–30 days</CardTitle>
                        <CardValue className="text-xl">{aged.d30}</CardValue>
                    </Card>
                    <Card>
                        <CardTitle>31–60 days</CardTitle>
                        <CardValue className="text-xl">{aged.d60}</CardValue>
                    </Card>
                    <Card>
                        <CardTitle>Over 60 days</CardTitle>
                        <CardValue className="text-xl">{aged.d90}</CardValue>
                    </Card>
                </div>
            </section>

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
                    <p className="mb-3 text-sm text-muted">
                        Expenses include founder-reimbursed items by spend date. Reimbursement
                        bank transfers are not counted again.
                    </p>
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
