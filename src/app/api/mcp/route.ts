import { NextResponse, type NextRequest } from "next/server";
import { createMcpHandler, type AuthInfo } from "@modelcontextprotocol/server";
import {
  MCP_RATE_LIMITS,
  assistantDisplayName,
  loadAssistantPerson,
  nameConnection,
  notifyAssistantConnected,
  touchConnection,
  type AssistantPerson,
} from "@/lib/assistant/mcp/access";
import { isTokenRemembered, publicOrigin, verifyAssistantRequest } from "@/lib/assistant/mcp/oauth";
import { createAssistantServer } from "@/lib/assistant/mcp/server";
import { clientIp, hitRateLimit, isOverRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type RequestAuth = AuthInfo & {
  extra: { person: AssistantPerson; origin: string; allowDrafts: boolean };
};

/** A fresh server per request, built for the person the token belongs to. */
const handler = createMcpHandler(({ authInfo }) => {
  const { person, origin, allowDrafts } = (authInfo as RequestAuth).extra;
  return createAssistantServer({ person, oauthClientId: authInfo!.clientId, origin, allowDrafts });
});

/** Assistants send a bearer token, never cookies, so any origin may call. */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

function withCors(response: Response): Response {
  for (const [key, value] of Object.entries(CORS)) response.headers.set(key, value);
  return response;
}

function refuse(status: number, message: string): Response {
  return withCors(NextResponse.json({ error: "access_denied", error_description: message }, { status }));
}

function tooManyRequests(retryAfterSeconds: number): Response {
  const response = refuse(429, "Too many requests. Wait a moment and try again.");
  response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}

/** The assistant's name, from the initialize message it sends when it starts. */
async function startingClientName(request: NextRequest): Promise<string | null> {
  if (request.method !== "POST") return null;
  const message: unknown = await request.clone().json().catch(() => null);
  if (!message || typeof message !== "object" || Array.isArray(message)) return null;
  const { method, params } = message as { method?: unknown; params?: { clientInfo?: unknown } };
  return method === "initialize" ? assistantDisplayName(params?.clientInfo) : null;
}

async function serve(request: NextRequest): Promise<Response> {
  const origin = publicOrigin(request.headers, request.nextUrl.origin);
  // Failed tokens are limited by IP because each one costs a check with
  // Clerk. A request with no token is the cheap first step of signing in, so
  // it isn't counted. A token this instance already checked isn't held back,
  // so bad tokens sent from an IP that assistants share can't lock out the
  // people already using it.
  const token = /^bearer\s+(\S+)/i.exec(request.headers.get("authorization") ?? "")?.[1];
  const ip = token ? clientIp(request.headers) : null;
  const ipKey = ip ? `mcp:ip:${ip}` : null;
  if (ipKey && !isTokenRemembered(token!)) {
    const ipLimit = await isOverRateLimit(ipKey, MCP_RATE_LIMITS.failedTokensPerIp);
    if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterSeconds);
  }

  const auth = await verifyAssistantRequest(request, origin);
  if (auth instanceof Response) {
    if (ipKey) await hitRateLimit(ipKey, MCP_RATE_LIMITS.failedTokensPerIp);
    return withCors(auth);
  }

  const clerkUserId = auth.extra?.clerkUserId;
  const connectionLimit = await hitRateLimit(
    `mcp:conn:${String(clerkUserId)}:${auth.clientId}`,
    MCP_RATE_LIMITS.requestsPerConnection,
  );
  if (!connectionLimit.allowed) return tooManyRequests(connectionLimit.retryAfterSeconds);
  const person = typeof clerkUserId === "string" ? await loadAssistantPerson(clerkUserId) : null;
  if (!person) return refuse(403, "This login isn't set up in Alfa yet. Sign in to Alfa and finish setting up first.");
  const connection = await touchConnection(person.localUserId, auth.clientId);
  if (!connection.allowed) {
    return refuse(
      403,
      "This assistant was disconnected from Alfa. To use it again, choose Allow again in Alfa under Settings, AI assistant.",
    );
  }
  const clientName = await startingClientName(request);
  if (clientName) await nameConnection(person.localUserId, connection.id, clientName);
  if (connection.isNew) {
    await notifyAssistantConnected({
      person,
      connectionId: connection.id,
      oauthClientId: auth.clientId,
      clientName,
    });
  }

  const response = await handler.fetch(request, {
    authInfo: { ...auth, extra: { ...auth.extra, person, origin, allowDrafts: connection.allowDrafts } },
  });
  return withCors(response);
}

export const GET = serve;
export const POST = serve;
export const DELETE = serve;

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
