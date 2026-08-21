import { NextResponse } from "next/server";
import { isAuthConfigured, isDatabaseConfigured } from "@/env";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "dot-and-dash-accounts",
    time: new Date().toISOString(),
    config: {
      auth: isAuthConfigured(),
      database: isDatabaseConfigured(),
    },
  });
}
