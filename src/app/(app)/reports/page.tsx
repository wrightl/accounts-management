import { guardTenantPage, hasPermission } from '@/lib/auth';
import {
    defaultReportPeriod,
    getAgedReceivables,
    getExpenseByCategory,
    getIncomeByMonth,
    getProfitAndLoss,
    getVatSummary,
} from '@/lib/reports/queries';
import { buttonClasses } from '@/components/ui/button';
import { Card, CardTitle, CardValue } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/form';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';

export default async function ReportsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const { companyId } = await guardTenantPage('reports:read');
    const canExport = await hasPermission('reports:export');
    const sp = await searchParams;

    const defaults = await defaultReportPeriod(companyId);
    const from = sp.from ?? defaults.from;
    const to = sp.to ?? defaults.to;

    const [pnl, aged, byMonth, byCategory, vat] = await Promise.all([
        getProfitAndLoss(companyId, from, to),
        getAgedReceivables(companyId),
        getIncomeByMonth(companyId, from, to),
        getExpenseByCategory(companyId, from, to),
        getVatSummary(companyId, from, to),
    ]);

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="font-display text-2xl font-semibold">
                        Reports
                    </h1>
                    <p className="mt-1 text-muted">
                        Accrual P&amp;L (invoiced income net of VAT), VAT summary,
                        receivables, and accountant export (CSVs, invoice PDFs,
                        receipt files, bank, and dividends from the Dividends page).
                    </p>
                </div>
                {canExport && (
                    <div className="flex flex-wrap gap-2">
                        <a
                            href={`/api/reports/vat?from=${from}&to=${to}`}
                            className={buttonClasses('secondary')}
                        >
                            Download VAT CSV
                        </a>
                        <a
                            href={`/api/reports/accountant-pack?from=${from}&to=${to}`}
                            className={buttonClasses('primary')}
                        >
                            Download accountant pack
                        </a>
                    </div>
                )}
            </div>

            <form className="mt-6 flex flex-wrap items-end gap-3">
                <div>
                    <Label htmlFor="from">From</Label>
                    <Input
                        id="from"
                        name="from"
                        type="date"
                        defaultValue={from}
                    />
                </div>
                <div>
                    <Label htmlFor="to">To</Label>
                    <Input id="to" name="to" type="date" defaultValue={to} />
                </div>
                <button type="submit" className={buttonClasses('secondary')}>
                    Update period
                </button>
            </form>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <Card>
                    <CardTitle>Income (invoiced, ex VAT)</CardTitle>
                    <CardValue>{pnl.incomeFormatted}</CardValue>
                </Card>
                <Card>
                    <CardTitle>Expenses (ex VAT)</CardTitle>
                    <CardValue>{pnl.expenseFormatted}</CardValue>
                </Card>
                <Card>
                    <CardTitle>Profit / (loss)</CardTitle>
                    <CardValue>{pnl.profitFormatted}</CardValue>
                </Card>
            </div>
            <p className="mt-3 text-sm text-muted">{pnl.basisNote}</p>

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
                        <CardTitle>90+ days</CardTitle>
                        <CardValue className="text-xl">{aged.d90}</CardValue>
                    </Card>
                </div>
            </section>

            <section className="mt-10 grid gap-8 lg:grid-cols-2">
                <div>
                    <h2 className="mb-3 font-display text-lg font-semibold">
                        Income by month (ex VAT)
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
