import "server-only";
import { writeAudit } from "@/lib/audit";
import { hmrcConfig } from "@/lib/hmrc/config";
import { getHmrcAccessToken } from "@/lib/hmrc/connections";

/** HMRC answered an API call with an error. */
export class HmrcApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** HMRC's error code, e.g. "INVALID_VRN" or "NOT_FOUND". */
    readonly code: string | null,
  ) {
    super(message);
    this.name = "HmrcApiError";
  }
}

export interface HmrcRequest {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Path on HMRC's API host, e.g. "/organisations/vat/123456789/obligations". */
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  /** API version for the Accept header; most HMRC APIs are 1.0. */
  apiVersion?: string;
  /** Extra headers, such as the fraud prevention headers (PR 6). */
  headers?: Record<string, string>;
  /** The person the call is made for, for the audit log; null for scheduled work. */
  actorUserId: string | null;
}

/**
 * Call an HMRC API as the company: a current access token (refreshed when
 * needed), HMRC's versioned Accept header, a timeout, and an audit entry for
 * every call with its method, path and status. Returns the parsed JSON body,
 * or null for an empty one.
 */
export async function hmrcFetch<T = unknown>(
  companyId: string,
  request: HmrcRequest,
  options: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<T | null> {
  const config = hmrcConfig();
  const fetchImpl = options.fetchImpl ?? fetch;
  const { accessToken, connectionId } = await getHmrcAccessToken(companyId, options);
  const method = request.method ?? "GET";

  const url = new URL(request.path, config.apiBase);
  for (const [k, v] of Object.entries(request.query ?? {})) url.searchParams.set(k, v);

  let response: Response | null = null;
  let failure: unknown = null;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        Accept: `application/vnd.hmrc.${request.apiVersion ?? "1.0"}+json`,
        Authorization: `Bearer ${accessToken}`,
        ...(request.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...request.headers,
      },
      body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    failure = e;
  }

  await writeAudit({
    companyId,
    actorUserId: request.actorUserId,
    action: "hmrc.api",
    entityType: "hmrc_connection",
    entityId: connectionId,
    meta: { method, path: request.path, status: response?.status ?? null },
  });

  if (!response) {
    throw new HmrcApiError(
      failure instanceof Error && failure.name === "TimeoutError"
        ? "HMRC took too long to answer. Try again in a minute."
        : "HMRC couldn't be reached. Try again in a minute.",
      null,
      null,
    );
  }
  const text = await response.text();
  const json: unknown = text ? safeJson(text) : null;
  if (!response.ok) {
    const body = json && typeof json === "object" ? (json as { code?: unknown; message?: unknown }) : {};
    const code = typeof body.code === "string" ? body.code : null;
    const message = typeof body.message === "string" ? body.message : `HMRC returned ${response.status}`;
    throw new HmrcApiError(message, response.status, code);
  }
  return json as T | null;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
