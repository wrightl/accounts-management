import { clerkMiddleware } from "@clerk/nextjs/server";

// Next.js 16 renamed the network-boundary file from `middleware.ts` to
// `proxy.ts`. Clerk still needs this helper for the session handshake.
// Auth itself is enforced on each page, layout, route handler, and server
// action — not via createRouteMatcher (deprecated).
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files unless referenced in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
