import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listExpenses } from "@/lib/expenses/queries";
import { getDb } from "@/db";
import { expenses, expenseReceipts } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user || !user.companyId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 50;

    const expensesList = await listExpenses(user.companyId, { status });
    const limitedExpenses = expensesList.slice(0, limit);

    const db = getDb();
    const expensesWithReceipts = await Promise.all(
      limitedExpenses.map(async (expense) => {
        const receipts = await db
          .select()
          .from(expenseReceipts)
          .where(eq(expenseReceipts.expenseId, expense.id));

        return {
          id: expense.id,
          companyId: user.companyId,
          description: expense.description,
          amountPence: expense.amountPence,
          category: expense.category,
          expenseDate: expense.spentAt,
          status: expense.status,
          notes: null,
          billable: expense.billable,
          source: "manual",
          receipts: receipts.map((r) => ({
            id: r.id,
            filename: r.filename,
            url: `/api/receipts/${r.id}`,
            fileSizeBytes: r.sizeBytes,
            uploadedAt: r.uploadedAt,
          })),
          createdByName: expense.createdByName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: expensesWithReceipts,
    });
  } catch (error) {
    console.error("Expenses list error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user || !user.companyId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { description, amountPence, category, expenseDate, billable } = body;

    if (!description || !amountPence || !category || !expenseDate) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const db = getDb();

    const [expense] = await db
      .insert(expenses)
      .values({
        companyId: user.companyId,
        description,
        amountPence,
        category,
        spentAt: expenseDate,
        status: "pending",
        billable: billable || false,
        source: "manual",
        createdByUserId: user.localUserId,
      })
      .returning();

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
        createdByName: user.name,
        createdAt: expense.createdAt.toISOString(),
        updatedAt: expense.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Create expense error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
