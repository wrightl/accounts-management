import { NextResponse } from "next/server";
import type { ActionResult } from "@/actions/result";

/** The mobile API's error shape. */
export function mobileError(
  error: string,
  status: number,
  fieldErrors?: Record<string, string>,
): NextResponse {
  return NextResponse.json({ success: false, error, fieldErrors }, { status });
}

/** 400 for a failed shared-lib result, logged 500 for anything thrown. */
export function mobileFailure(result: Extract<ActionResult, { ok: false }>): NextResponse {
  return mobileError(result.error, 400, result.fieldErrors);
}

export function mobileServerError(label: string, error: unknown): NextResponse {
  console.error(`${label}:`, error);
  return mobileError("Internal server error", 500);
}
