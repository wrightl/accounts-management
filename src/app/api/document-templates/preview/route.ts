import { NextResponse } from "next/server";
import { requirePermission, ForbiddenError, type SessionUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import { contentDispositionInline } from "@/lib/files";
import { getDocumentTemplate } from "@/lib/pdf/designer/queries";
import { renderDesignSamplePdf } from "@/lib/pdf/designer/render";
import { parseTemplateDesign } from "@/lib/pdf/designer/schema";
import { isDocumentKind, isTemplateKey } from "@/lib/pdf/templates/registry";
import { renderSampleTemplatePdf } from "@/lib/pdf/templates/render";
import { getCompanySettings } from "@/lib/settings/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Authorised =
  | { ok: true; user: SessionUser & { companyId: string } }
  | { ok: false; response: NextResponse };

async function authorise(): Promise<Authorised> {
  try {
    const user = await requirePermission("settings:manage");
    if (!user.companyId) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Complete onboarding first" }, { status: 403 }),
      };
    }
    return { ok: true, user: { ...user, companyId: user.companyId } };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { ok: false, response: NextResponse.json({ error: e.message }, { status: 403 }) };
    }
    throw e;
  }
}

function pdfResponse(bytes: Uint8Array, filename: string): NextResponse {
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDispositionInline(filename),
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * A sample document in a library template (`?template=modern&kind=quote`) or
 * in one of the company's saved designs (`?design=<id>`), with made-up
 * figures and the company's own details and logo.
 */
export async function GET(request: Request) {
  const auth = await authorise();
  if (!auth.ok) return auth.response;
  const { companyId } = auth.user;

  const params = new URL(request.url).searchParams;
  const company = await getCompanySettings(companyId);

  const designId = params.get("design");
  if (designId) {
    const entitlements = await getEntitlements(companyId);
    const template = entitlements.invoiceDesigner
      ? await getDocumentTemplate(companyId, designId)
      : null;
    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const bytes = await renderDesignSamplePdf({
      companyId,
      design: template.design,
      kind: template.kind,
      company,
    });
    return pdfResponse(bytes, `${template.kind}-preview.pdf`);
  }

  const templateKey = params.get("template");
  const kind = params.get("kind") ?? "invoice";
  if (!isTemplateKey(templateKey) || !isDocumentKind(kind)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const bytes = await renderSampleTemplatePdf({ templateKey, kind, company });
  return pdfResponse(bytes, `${templateKey}-${kind}-preview.pdf`);
}

/**
 * A sample document in a design that hasn't been saved yet (the editor's
 * "Preview as PDF"). The body is `{ kind, design }`.
 */
export async function POST(request: Request) {
  const auth = await authorise();
  if (!auth.ok) return auth.response;
  const { companyId } = auth.user;

  const entitlements = await getEntitlements(companyId);
  if (!entitlements.invoiceDesigner) {
    return NextResponse.json({ error: "Not available on this plan" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid design" }, { status: 400 });
  }
  const { kind, design } = (body && typeof body === "object" ? body : {}) as {
    kind?: unknown;
    design?: unknown;
  };
  if (!isDocumentKind(kind)) return NextResponse.json({ error: "Invalid design" }, { status: 400 });
  const parsed = parseTemplateDesign(design);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const company = await getCompanySettings(companyId);
  // Pictures are looked up by company, so a design can only ever show its own.
  const bytes = await renderDesignSamplePdf({ companyId, design: parsed.design, kind, company });
  return pdfResponse(bytes, `${kind}-preview.pdf`);
}
