import { NextResponse } from "next/server";

/**
 * next.config.ts leaves framing headers to the routes the expense page frames
 * (receipt previews, the email body). Their error responses use this so only
 * a successful file or body can be framed.
 */
export function unframeableJsonError(error: string, status: number): NextResponse {
  return NextResponse.json(
    { error },
    {
      status,
      headers: {
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "frame-ancestors 'none'",
      },
    },
  );
}
