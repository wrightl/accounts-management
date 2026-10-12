import { NextResponse } from "next/server";
import { requirePermission, ForbiddenError } from "@/lib/auth";
import { getDividendPaperwork } from "@/lib/dividends/queries";
import { dividendPaperworkFilename } from "@/lib/dividends/paperwork";
import { renderDividendPaperworkPdf } from "@/lib/dividends/paperwork-pdf";
import { contentDispositionAttachment } from "@/lib/files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Board minutes and a voucher per shareholder for one dividend declaration. */
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
  const paperwork = await getDividendPaperwork(user.companyId, id);
  if (!paperwork) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bytes = await renderDividendPaperworkPdf(paperwork);
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDispositionAttachment(
        dividendPaperworkFilename(paperwork.declaration.declaredAt),
      ),
      "Cache-Control": "private, no-store",
    },
  });
}
