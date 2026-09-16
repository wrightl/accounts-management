import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/db";
import { expenses, expenseReceipts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getStorage } from "@/lib/storage";
import { safeFilename } from "@/lib/files";
import { nanoid } from "nanoid";

type Params = Promise<{ id: string }>;

export async function POST(
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

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "No file provided" },
        { status: 400 }
      );
    }

    const storage = getStorage();
    const safeFileName = safeFilename(file.name);
    const receiptId = nanoid();
    const blobKey = `receipts/${user.companyId}/${params.id}/${receiptId}-${safeFileName}`;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    await storage.put(blobKey, buffer, {
      access: "private",
    } as { access: string });

    const [receipt] = await db
      .insert(expenseReceipts)
      .values({
        expenseId: params.id,
        blobPath: blobKey,
        filename: safeFileName,
        sizeBytes: buffer.length,
        contentType: file.type,
      })
      .returning();

    return NextResponse.json({
      success: true,
      receiptId: receipt.id,
      message: "Receipt uploaded successfully",
    });
  } catch (error) {
    console.error("Upload receipt error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
