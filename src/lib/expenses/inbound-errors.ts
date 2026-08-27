export type FetchErrorDetail = {
  message: string;
  cause?: string;
  code?: string;
};

/** Extract message, nested cause, and system error code from fetch/network failures. */
export function describeFetchError(err: unknown): FetchErrorDetail {
  if (!(err instanceof Error)) {
    return { message: String(err) };
  }

  const cause = err.cause;
  if (cause instanceof Error) {
    const code =
      "code" in cause && typeof cause.code === "string" ? cause.code : undefined;
    return {
      message: err.message,
      cause: cause.message,
      code,
    };
  }

  return { message: err.message };
}

/** Log-friendly URL without query tokens (e.g. signed download URLs). */
export function sanitizeUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "(invalid url)";
  }
}

export function inboundStepError(
  step: string,
  err: unknown,
  meta?: Record<string, string | number | null | undefined>,
): Error {
  const detail = describeFetchError(err);
  const parts = [`[${step}]`, detail.message];
  if (detail.cause) parts.push(`cause: ${detail.cause}`);
  if (detail.code) parts.push(`code: ${detail.code}`);
  if (meta && Object.keys(meta).length > 0) {
    parts.push(JSON.stringify(meta));
  }
  const wrapped = new Error(parts.join(" · "));
  if (err instanceof Error) wrapped.cause = err;
  return wrapped;
}

export type ParsedInboundError = {
  step?: string;
  summary: string;
  cause?: string;
  code?: string;
  attachment?: string;
  url?: string;
};

/** Parse stored inbound job errors for admin display. */
export function parseInboundErrorMessage(
  raw: string | null | undefined,
): ParsedInboundError | null {
  if (!raw?.trim()) return null;

  const trimmed = raw.trim();
  if (trimmed.startsWith("REJECTED:")) {
    return { summary: trimmed.slice("REJECTED:".length).trim() };
  }

  let step: string | undefined;
  let rest = trimmed;
  const stepMatch = rest.match(/^\[([^\]]+)\]\s*(?:·\s*)?/);
  if (stepMatch) {
    step = stepMatch[1];
    rest = rest.slice(stepMatch[0].length);
  }

  const parts = rest
    .split(/\s·\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  const summary = parts[0] ?? rest;
  let cause: string | undefined;
  let code: string | undefined;
  let attachment: string | undefined;
  let url: string | undefined;

  for (const part of parts.slice(1)) {
    if (part.startsWith("cause:")) {
      cause = part.slice("cause:".length).trim();
    } else if (part.startsWith("code:")) {
      code = part.slice("code:".length).trim();
    } else if (part.startsWith("{")) {
      try {
        const meta = JSON.parse(part) as { attachment?: string; url?: string };
        attachment = meta.attachment;
        url = meta.url;
      } catch {
        /* ignore malformed meta */
      }
    }
  }

  return { step, summary, cause, code, attachment, url };
}

export type InboundEmailJobStatus = "pending" | "processed" | "rejected" | "failed";

export function inboundJobNeedsAttention(
  status: InboundEmailJobStatus,
  lastError: string | null | undefined,
): boolean {
  if (status === "failed") return true;
  if (status === "pending" && lastError) return true;
  return false;
}

export function inboundJobStatusLabel(
  status: InboundEmailJobStatus,
  lastError?: string | null,
): string {
  if (status === "pending" && lastError) return "Retry pending";
  switch (status) {
    case "pending":
      return "Pending";
    case "processed":
      return "Processed";
    case "rejected":
      return "Rejected";
    case "failed":
      return "Failed";
  }
}
