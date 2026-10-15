import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { createExpenseRecord } from "@/lib/expenses/create";
import { listExpenses } from "@/lib/expenses/queries";
import { parseExpenseInput } from "@/lib/expenses/schema";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { toMobileExpense } from "@/lib/mobile/expense-payload";
import { loadMobileExpense, receiptsByExpense } from "@/lib/mobile/expenses";
import { ensureLocalUser } from "@/lib/users";

export async function GET(request: NextRequest) {
  try {
    const authz = await requireMobileAuth("accounts:read");
    if (!authz.ok) return authz.response;
    const { user } = authz;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 50;

    const rows = (await listExpenses(user.companyId, { status })).slice(0, limit);
    const receipts = await receiptsByExpense(rows.map((row) => row.id));

    return NextResponse.json({
      success: true,
      data: rows.map((row) =>
        toMobileExpense({
          ...row,
          companyId: user.companyId,
          receipts: (receipts.get(row.id) ?? []).map((r) => ({
            id: r.id,
            filename: r.filename,
            sizeBytes: r.sizeBytes,
            uploadedAt: r.uploadedAt,
          })),
        }),
      ),
    });
  } catch (error) {
    console.error("Expenses list error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Map the mobile JSON body onto the web form's fields. */
function expenseRawFromJson(body: Record<string, unknown>): Record<string, unknown> {
  const pence = body.amountPence;
  return {
    description: optionalString(body.description),
    category: optionalString(body.category),
    spentAt: optionalString(body.expenseDate),
    amountPounds:
      typeof pence === "number" && Number.isFinite(pence)
        ? (pence / 100).toFixed(2)
        : "",
    status: optionalString(body.status),
    billable: body.billable === true ? "true" : "",
    clientId: optionalString(body.clientId),
    orderId: optionalString(body.orderId),
    paidByUserId: optionalString(body.paidByUserId),
    vatRate: typeof body.vatRate === "number" ? String(body.vatRate) : "0",
    useMileage: body.useMileage === true ? "true" : "",
    mileageMiles: typeof body.mileageMiles === "number" ? String(body.mileageMiles) : "",
    mileageRatePence:
      typeof body.mileageRatePence === "number" ? String(body.mileageRatePence) : "",
  };
}

// Same validation and saving as the web form (createExpense).
export async function POST(request: NextRequest) {
  try {
    const authz = await requireMobileAuth("accounts:write", { checkSuspended: true });
    if (!authz.ok) return authz.response;
    const { user } = authz;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid JSON" },
        { status: 400 }
      );
    }

    const parsed = parseExpenseInput(expenseRawFromJson(body));
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.error, fieldErrors: parsed.fieldErrors },
        { status: 400 }
      );
    }

    const localUserId = await ensureLocalUser(user);
    const result = await createExpenseRecord(
      { companyId: user.companyId, localUserId },
      parsed.data,
    );
    if (!result.ok || !result.id) {
      return NextResponse.json(
        {
          success: false,
          error: result.ok ? "Could not create expense" : result.error,
          fieldErrors: result.ok ? undefined : result.fieldErrors,
        },
        { status: 400 }
      );
    }

    await writeAudit({
      companyId: user.companyId,
      actorUserId: localUserId,
      action: "expense.create",
      entityType: "expense",
      entityId: result.id,
      meta: { source: "mobile" },
    });

    return NextResponse.json(
      { success: true, data: await loadMobileExpense(user.companyId, result.id) },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create expense error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
