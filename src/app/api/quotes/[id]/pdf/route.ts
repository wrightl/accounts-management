import { NextResponse } from "next/server";
import { requirePermission, ForbiddenError } from "@/lib/auth";
import { loadOrRenderQuotePdf } from "@/lib/quotes/pdf-cache";
import { contentDispositionAttachment } from "@/lib/files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
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
  const versionParam = new URL(request.url).searchParams.get("version");
  const version =
    versionParam != null && versionParam !== ""
      ? Number.parseInt(versionParam, 10)
      : undefined;
  if (version != null && (!Number.isFinite(version) || version < 1)) {
    return NextResponse.json({ error: "Invalid version" }, { status: 400 });
  }

  try {
    const { bytes, filename } = await loadOrRenderQuotePdf(id, { version });
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDispositionAttachment(filename),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Not found";
    if (message === "Quote not found" || message === "Quote version not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    throw e;
  }
}
