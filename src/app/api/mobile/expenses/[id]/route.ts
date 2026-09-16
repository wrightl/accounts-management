import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/db";
import { expenses } from "@/db/schema";
import { and, eq } from "drizzle-orm";

type Params = Promise<{ id: string }>;

export async function GET(
  request: NextRequest,
  segmentData: { params: Params }
) {
  const params = await segmentData.params;
  try {
    const user = await getCurrentUser();
    
    if (!user || !user.companyId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const db = getDb();
    const [expense] = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.id, params.id),
          eq(expenses.companyId, user.companyId)
        )
      )
      .limit(1);

    if (!expense) {
      return NextResponse.json(
        { ok: false, error: "Expense not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: expense.id,
        companyId: expense.companyId,
        description: expense.description,
        amountPence: expense.amountPence,
        category: expense.category,
        expenseDate: expense.spentAt,
        status: expense.status,
        notes: null,
        billable: expense.billable,
        source: expense.source,
        receipts: [],
        createdAt: expense.createdAt.toISOString(),
        updatedAt: expense.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Get expense error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
