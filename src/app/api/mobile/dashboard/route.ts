import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { firstNameFrom, toMobileDashboard } from "@/lib/dashboard/mobile";
import { getDashboardOverview } from "@/lib/dashboard/queries";
import { can } from "@/lib/roles";
import { formatGBP } from "@/lib/money";
import { getSafeToPay } from "@/lib/safe-to-pay/queries";

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
    // Same card as the web Overview; a secondary figure, so never fatal.
    const safe =
      user.entityType === "limited_company" && can(user.role, "reports:read")
        ? await getSafeToPay(user.companyId).catch(() => null)
        : null;

    return NextResponse.json({
      success: true,
      data: {
        ...toMobileDashboard(overview, { role: user.role, firstName }),
        safeToPay: safe
          ? {
              safeNowFormatted: formatGBP(safe.result.safeNowPence),
              safeLaterFormatted: safe.cash.known
                ? formatGBP(safe.result.safeLaterPence)
                : null,
              cashKnown: safe.cash.known,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
