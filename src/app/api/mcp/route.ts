import { NextResponse, type NextRequest } from "next/server";
import { createMcpHandler, type AuthInfo } from "@modelcontextprotocol/server";
import {
  assistantDisplayName,
  loadAssistantPerson,
  nameConnection,
  touchConnection,
  type AssistantPerson,
} from "@/lib/assistant/mcp/access";
import { publicOrigin, verifyAssistantRequest } from "@/lib/assistant/mcp/oauth";
import { createAssistantServer } from "@/lib/assistant/mcp/server";

export const dynamic = "force-dynamic";

type RequestAuth = AuthInfo & { extra: { person: AssistantPerson; origin: string } };

/** A fresh server per request, built for the person the token belongs to. */
const handler = createMcpHandler(({ authInfo }) => {
  const { person, origin } = (authInfo as RequestAuth).extra;
  return createAssistantServer({ person, oauthClientId: authInfo!.clientId, origin });
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
  const auth = await verifyAssistantRequest(request, origin);
  if (auth instanceof Response) return withCors(auth);

  const clerkUserId = auth.extra?.clerkUserId;
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
  if (clientName) await nameConnection(connection.id, clientName);

  const response = await handler.fetch(request, {
    authInfo: { ...auth, extra: { ...auth.extra, person, origin } },
  });
  return withCors(response);
}

export const GET = serve;
export const POST = serve;
export const DELETE = serve;

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
