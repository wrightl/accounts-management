import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  canAccessResource,
  isMobileResource,
  loadBooksPage,
} from "@/lib/mobile/records";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
    if (!user.companyId) {
      return NextResponse.json(
        { success: false, error: "Complete onboarding first." },
        { status: 403 },
      );
    }

    const resource = request.nextUrl.searchParams.get("resource") ?? "";
    if (!isMobileResource(resource)) {
      return NextResponse.json(
        { success: false, error: "Unknown resource" },
        { status: 400 },
      );
    }
    if (!canAccessResource(resource, user)) {
      return NextResponse.json(
        { success: false, error: "Your role cannot view this." },
        { status: 403 },
      );
    }

    const data = await loadBooksPage(user.companyId, user, resource);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Mobile records error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
