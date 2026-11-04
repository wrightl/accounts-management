import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isLogoContentType } from "@/lib/company-logo-file";
import { sniffReceiptContentType } from "@/lib/expenses/receipt-file";
import { contentDispositionInline } from "@/lib/files";
import { getCompanySettings } from "@/lib/settings/queries";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * A picture needs none of what a page can do, so nothing may run or load if
 * someone opens the logo's address directly. next.config leaves this
 * route's Content-Security-Policy to it.
 */
const LOGO_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'";

/**
 * Stream the signed-in user's company logo from private storage.
 * Available to any authenticated member of the company (navbar + settings).
 * Only picture formats are served: anything else, such as an SVG uploaded
 * before uploads were checked, is treated as missing.
 */
export async function GET() {
  const user = await requireUser();
  if (!user.companyId) {
    return NextResponse.json({ error: "Complete onboarding first" }, { status: 403 });
  }

  const settings = await getCompanySettings(user.companyId);
  if (!settings.logoUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const obj = await getStorage().get(settings.logoUrl);
    const bytes = Buffer.from(obj.body);
    // Judged by the bytes, not the stored label, which came from the browser before uploads were checked.
    const contentType = sniffReceiptContentType(bytes);
    if (!isLogoContentType(contentType)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType!,
        "Content-Disposition": contentDispositionInline("logo"),
        "Content-Security-Policy": LOGO_CSP,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "company.logo.get",
        path: settings.logoUrl,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
