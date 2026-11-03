import type { NextRequest } from "next/server";
import { oauthDiscoveryResponse, publicOrigin } from "@/lib/assistant/mcp/oauth";

export const dynamic = "force-dynamic";

/** OAuth discovery for AI assistants connecting to Alfa's MCP server. */
export function GET(request: NextRequest): Promise<Response> {
  return oauthDiscoveryResponse(request, publicOrigin(request.headers, request.nextUrl.origin));
}

export const OPTIONS = GET;
