import { clerkMiddleware } from "@clerk/nextjs/server";

// Next.js 16 renamed the network-boundary file from `middleware.ts` to
// `proxy.ts`. Clerk still needs this helper for the session handshake.
// Auth itself is enforced on each page, layout, route handler, and server
// action — not via createRouteMatcher (deprecated).
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files unless referenced in search params.
    // Skip /api/mcp: assistants send an OAuth bearer token that the route
    // checks itself, never a Clerk session, so running Clerk here only adds
    // a second billed invocation to every assistant call.
    "/((?!_next|api/mcp|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for other API routes.
    "/(api(?!/mcp)|trpc)(.*)",
  ],
};
