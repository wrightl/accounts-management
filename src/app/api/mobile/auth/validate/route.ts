import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    if (!user.companyId) {
      return NextResponse.json(
        { ok: false, error: "No company associated with this user" },
        { status: 403 }
      );
    }
    
    return NextResponse.json({
      success: true,
      user: {
        id: user.localUserId,
        clerkUserId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
      },
    });
  } catch (error) {
    console.error("Auth validation error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
