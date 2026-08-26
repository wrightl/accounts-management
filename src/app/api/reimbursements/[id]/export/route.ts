import { NextResponse } from "next/server";
import { requirePermission, ForbiddenError } from "@/lib/auth";
import { getReimbursementDetail } from "@/lib/reimbursements/queries";

export const dynamic = "force-dynamic";

/** CSV export of a reimbursement run. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await requirePermission("accounts:read");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }
  if (!user.companyId) {
    return NextResponse.json({ error: "Complete onboarding first" }, { status: 403 });
  }

  const { id } = await context.params;
  const detail = await getReimbursementDetail(user.companyId, id);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const lines = [
    ["reimbursement_id", "payee", "status", "reference", "total_gbp"].join(","),
    [
      detail.reimbursement.id,
      csv(detail.payee.name || detail.payee.email),
      detail.reimbursement.status,
      csv(detail.reimbursement.reference ?? ""),
      (detail.reimbursement.totalPence / 100).toFixed(2),
    ].join(","),
    "",
    ["expense_id", "date", "description", "category", "amount_gbp"].join(","),
    ...detail.items.map((i) =>
      [
        i.expense.id,
        i.expense.spentAt ?? "",
        csv(i.expense.description),
        csv(i.expense.category ?? ""),
        (i.expense.amountPence / 100).toFixed(2),
      ].join(","),
    ),
  ];

  const body = lines.join("\n") + "\n";
  const filename = `reimbursement-${detail.reimbursement.id.slice(0, 8)}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function csv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
