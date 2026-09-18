import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { getReimbursementDetail } from "@/lib/reimbursements/queries";
import { canEditReimbursement } from "@/lib/reimbursements/status";
import { ReimbursementActions } from "@/components/reimbursements/actions";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export default async function ReimbursementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;

  const detail = await getReimbursementDetail(companyId, id);
  if (!detail) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link href="/reimbursements" className={buttonClasses("ghost")}>
          ← Reimbursements
        </Link>
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
              ? ` · Paid ${detail.reimbursement.paidAt.toISOString().slice(0, 10)}`
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

      <div className="mt-6">
        <ReimbursementActions
          id={detail.reimbursement.id}
          status={detail.reimbursement.status}
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
                <TD className="text-muted">{i.expense.spentAt ?? "—"}</TD>
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
    </div>
  );
}
