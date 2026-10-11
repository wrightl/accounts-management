import { NextResponse } from "next/server";
import { requirePermission, ForbiddenError } from "@/lib/auth";
import { getCreditNoteDetail } from "@/lib/credit-notes/queries";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { renderCreditNotePdf } from "@/lib/invoices/pdf-v2";
import { contentDispositionAttachment } from "@/lib/files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const detail = await getCreditNoteDetail(user.companyId, id);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const company = await getOrCreateCompanySettings(user.companyId);
  const bytes = await renderCreditNotePdf({
    creditNote: detail.creditNote,
    invoiceNumber: detail.invoice.number,
    client: detail.client,
    lines: detail.lines,
    company,
  });

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDispositionAttachment(`${detail.creditNote.number}.pdf`),
      "Cache-Control": "private, no-store",
    },
  });
}
