import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { recordScopeFor } from "@/lib/accountant/record-scope";
import { RecordQueries } from "@/components/queries/record-queries";
import { getReimbursementDetail } from "@/lib/reimbursements/queries";
import { canEditReimbursement } from "@/lib/reimbursements/status";
import { listBankSettlements } from "@/lib/bank/settlements";
import { BankSettlements } from "@/components/bank/bank-settlements";
import { ReimbursementActions } from "@/components/reimbursements/actions";
import { buttonClasses } from "@/components/ui/button";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DisplayDate } from "@/components/date-format-provider";

export default async function ReimbursementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId, role } = await guardTenantPage("records:read");
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;

  const [detail, settlements] = await Promise.all([
    getReimbursementDetail(companyId, id, recordScopeFor(role)),
    listBankSettlements(companyId, { reimbursementId: id }),
  ]);
  if (!detail) notFound();

  return (
    <div>
      <div className="mb-6">
        <BackLink href="/reimbursements">Reimbursements</BackLink>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">
              {detail.payee.name || detail.payee.email}
            </h1>
            {canWrite && canEditReimbursement(detail.reimbursement.status) ? (
              <Link
                href={`/reimbursements/${detail.reimbursement.id}/edit`}
                className={buttonClasses("ghost", "size-9 shrink-0 px-0")}
                aria-label="Edit reimbursement run"
              >
                <Pencil className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
          <p className="mt-1 capitalize text-muted">
            {detail.reimbursement.status}
            {detail.reimbursement.paidAt
              ? <> · Paid <DisplayDate value={detail.reimbursement.paidAt} /></>
              : detail.reimbursement.reimbursementDate
                ? <> · Reimbursement date <DisplayDate value={detail.reimbursement.reimbursementDate} /></>
                : null}
          </p>
          {detail.reimbursement.reference ? (
            <p className="mt-2 text-sm">
              Bank reference:{" "}
              <span className="font-medium text-foreground">
                {detail.reimbursement.reference}
              </span>
            </p>
          ) : detail.reimbursement.status === "pending" ? (
            <p className="mt-2 text-sm text-muted">
              Add a bank payment reference when creating the run, then use it on the transfer.
            </p>
          ) : null}
        </div>
        <Card className="min-w-[140px]">
          <CardTitle>Total</CardTitle>
          <CardValue>{detail.totalFormatted}</CardValue>
        </Card>
      </div>

      <BankSettlements settlements={settlements} className="mt-6" />

      <div className="mt-6">
        <ReimbursementActions
          id={detail.reimbursement.id}
          status={detail.reimbursement.status}
          reimbursementDate={detail.reimbursement.reimbursementDate}
          canWrite={canWrite}
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 font-display text-lg font-semibold">Expenses</h2>
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Description</TH>
              <TH>Category</TH>
              <TH className="text-right">Amount</TH>
            </TR>
          </THead>
          <TBody>
            {detail.items.map((i) => (
              <TR key={i.itemId}>
                <TD className="text-muted"><DisplayDate value={i.expense.spentAt} /></TD>
                <TD>
                  <Link
                    href={`/expenses/${i.expense.id}`}
                    className="text-foreground hover:underline"
                  >
                    {i.expense.description}
                  </Link>
                </TD>
                <TD>{i.expense.category ?? "—"}</TD>
                <TD className="text-right">{i.expense.amountFormatted}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <RecordQueries
        companyId={companyId}
        role={role}
        kind="reimbursement"
        recordId={detail.reimbursement.id}
      />
    </div>
  );
}
