import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isAuthConfigured } from "@/env";

// Next.js 16 renamed the network-boundary file from `middleware.ts` to
// `proxy.ts`. Clerk still needs this helper for the session handshake.
// Auth itself is enforced on each page, layout, route handler, and server
// action — not via createRouteMatcher (deprecated).
const clerkProxy = clerkMiddleware();

// Before Clerk keys are configured, fall back to a pass-through so the app can
// still build, run public pages, and be tested. Auth activates automatically
// once the credentials are present.
const proxy = isAuthConfigured()
  ? clerkProxy
  : () => NextResponse.next();

export default proxy;

export const config = {
  matcher: [
    // Skip Next.js internals and static files unless referenced in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
