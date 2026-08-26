import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCompanySettings } from "@/lib/settings/queries";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stream the signed-in user's company logo from private storage.
 * Available to any authenticated member of the company (navbar + settings).
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
    return new NextResponse(Buffer.from(obj.body), {
      status: 200,
      headers: {
        "Content-Type": obj.contentType ?? "image/png",
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
