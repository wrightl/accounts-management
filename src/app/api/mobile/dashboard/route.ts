import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { firstNameFrom, toMobileDashboard } from "@/lib/dashboard/mobile";
import { getDashboardOverview } from "@/lib/dashboard/queries";
import { can } from "@/lib/roles";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const firstName = firstNameFrom(user.name);

    if (user.role === "pending") {
      return NextResponse.json({
        success: true,
        data: { role: "pending", firstName },
      });
    }

    if (!can(user.role, "accounts:read")) {
      return NextResponse.json(
        {
          success: false,
          error: "Your role cannot view dashboard metrics.",
          code: "no_permission",
        },
        { status: 403 },
      );
    }

    if (!user.companyId) {
      return NextResponse.json(
        {
          success: false,
          error: "Complete onboarding to view dashboard metrics.",
          code: "no_company",
        },
        { status: 403 },
      );
    }

    const period = request.nextUrl.searchParams.get("period");
    const overview = await getDashboardOverview(user.companyId, user, period);

    return NextResponse.json({
      success: true,
      data: toMobileDashboard(overview, { role: user.role, firstName }),
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
