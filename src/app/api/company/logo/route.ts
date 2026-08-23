import { NextResponse } from "next/server";
import { requirePermission, ForbiddenError } from "@/lib/auth";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stream the company logo from private storage. Never expose the Blob URL.
 */
export async function GET() {
  try {
    await requirePermission("settings:manage");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }

  const settings = await getOrCreateCompanySettings();
  if (!settings.logoUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const obj = await getStorage().get(settings.logoUrl);
    return new NextResponse(Buffer.from(obj.body), {
      status: 200,
      headers: {
        "Content-Type": obj.contentType ?? "image/png",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
