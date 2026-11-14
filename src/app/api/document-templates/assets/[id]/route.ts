import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoiceTemplateAssets } from "@/db/schema";
import { requirePermission, ForbiddenError } from "@/lib/auth";
import { isLogoContentType } from "@/lib/company-logo-file";
import { sniffReceiptContentType } from "@/lib/expenses/receipt-file";
import { contentDispositionInline } from "@/lib/files";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** As for the company logo: nothing may run or load if the address is opened directly. */
const IMAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'";

/** A picture uploaded for the company's designs, for the template designer. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await requirePermission("settings:manage");
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
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [asset] = await getDb()
    .select({ blobPath: invoiceTemplateAssets.blobPath })
    .from(invoiceTemplateAssets)
    .where(
      and(eq(invoiceTemplateAssets.id, id), eq(invoiceTemplateAssets.companyId, user.companyId)),
    )
    .limit(1);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const stored = await getStorage().get(asset.blobPath);
    const bytes = Buffer.from(stored.body);
    const contentType = sniffReceiptContentType(bytes);
    if (!isLogoContentType(contentType)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType!,
        "Content-Disposition": contentDispositionInline("image"),
        "Content-Security-Policy": IMAGE_CSP,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
