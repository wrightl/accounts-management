import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { invoiceImportDrafts } from "@/db/schema";
import { ForbiddenError, requirePermission } from "@/lib/auth";
import { contentDispositionInline } from "@/lib/files";
import { unframeableJsonError } from "@/lib/frameable-route";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Stream a staged invoice PDF, so the review page can show it beside its details. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await requirePermission("accounts:write");
  } catch (e) {
    if (e instanceof ForbiddenError) return unframeableJsonError(e.message, 403);
    throw e;
  }
  if (!user.companyId) return unframeableJsonError("Complete onboarding first", 403);

  const { id } = await context.params;
  const [draft] = await getDb()
    .select({
      path: invoiceImportDrafts.documentPath,
      filename: invoiceImportDrafts.documentFilename,
    })
    .from(invoiceImportDrafts)
    .where(
      and(
        eq(invoiceImportDrafts.id, id),
        eq(invoiceImportDrafts.companyId, user.companyId),
      ),
    )
    .limit(1);
  if (!draft?.path) return unframeableJsonError("Not found", 404);

  try {
    const obj = await getStorage().getStream(draft.path);
    return new NextResponse(obj.stream, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDispositionInline(draft.filename ?? "invoice.pdf"),
        "Cache-Control": "private, no-store",
        // next.config leaves these to us. Only files sniffed as PDFs are stored here.
        "Content-Security-Policy": "frame-ancestors 'self'",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch {
    return unframeableJsonError("File unavailable", 404);
  }
}
