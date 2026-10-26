import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { expenseReceipts, expenses } from "@/db/schema";
import { requirePermission, ForbiddenError } from "@/lib/auth";
import { getStorage } from "@/lib/storage";
import { isPreviewableReceipt } from "@/lib/expenses/receipt-file";
import { contentDispositionAttachment, contentDispositionInline } from "@/lib/files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stream a private receipt file. Never expose the Blob URL to the client.
 * Scoped to the caller's company via join to expenses. `?inline=1` lets a
 * PDF or image show in the page instead of downloading.
 */
export async function GET(
  request: Request,
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
  const companyId = user.companyId;

  const { id } = await context.params;
  const db = getDb();
  const [row] = await db
    .select({ receipt: expenseReceipts })
    .from(expenseReceipts)
    .innerJoin(expenses, eq(expenseReceipts.expenseId, expenses.id))
    .where(and(eq(expenseReceipts.id, id), eq(expenses.companyId, companyId)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { receipt } = row;
  const inline =
    new URL(request.url).searchParams.get("inline") === "1" &&
    isPreviewableReceipt(receipt.contentType);
  try {
    const obj = await getStorage().get(receipt.blobPath);
    return new NextResponse(Buffer.from(obj.body), {
      status: 200,
      headers: {
        "Content-Type": receipt.contentType ?? obj.contentType ?? "application/octet-stream",
        "Content-Disposition": inline
          ? contentDispositionInline(receipt.filename)
          : contentDispositionAttachment(receipt.filename),
        "Cache-Control": "private, no-store",
        // next.config leaves these to us so the expense page can frame a preview.
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch {
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
