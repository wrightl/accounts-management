import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ status: "ok" });
  }
  return NextResponse.json({
    status: "ok",
    service: "dot-and-dash-accounts",
    time: new Date().toISOString(),
  });
}
