import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { expenseReceipts } from "@/db/schema";
import { requirePermission, ForbiddenError } from "@/lib/auth";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stream a private receipt file. Never expose the Blob URL to the client.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("accounts:read");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }

  const { id } = await context.params;
  const db = getDb();
  const [receipt] = await db
    .select()
    .from(expenseReceipts)
    .where(eq(expenseReceipts.id, id))
    .limit(1);

  if (!receipt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const obj = await getStorage().get(receipt.blobPath);
    return new NextResponse(Buffer.from(obj.body), {
      status: 200,
      headers: {
        "Content-Type": receipt.contentType ?? obj.contentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${receipt.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
