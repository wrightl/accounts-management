"use client";

import { useState } from "react";

/**
 * The email a claim came from, as it was sent. The body is served by its own
 * route with a sandboxing CSP, so scripts and remote content never run here.
 */
export function EmailBodyPanel({
  expenseId,
  email,
}: {
  expenseId: string;
  email: {
    fromEmail: string;
    subject: string | null;
    receivedAt: string;
    hasHtml: boolean;
    hasText: boolean;
  };
}) {
  const [format, setFormat] = useState<"html" | "text">(email.hasHtml ? "html" : "text");
  const hasBody = email.hasHtml || email.hasText;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Email</h2>
        {hasBody ? (
          <span className="text-xs text-muted">
            Sent as {email.hasHtml ? "HTML" : "plain text"}
            {email.hasHtml && email.hasText ? (
              <>
                {" · "}
                <button
                  type="button"
                  className="underline hover:text-foreground"
                  onClick={() => setFormat(format === "html" ? "text" : "html")}
                >
                  {format === "html" ? "View plain text" : "View HTML"}
                </button>
              </>
            ) : null}
          </span>
        ) : null}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">From</dt>
        <dd className="break-all">{email.fromEmail}</dd>
        <dt className="text-muted">Subject</dt>
        <dd>{email.subject || "(no subject)"}</dd>
        <dt className="text-muted">Received</dt>
        <dd>{email.receivedAt}</dd>
      </dl>
      {hasBody ? (
        <iframe
          key={format}
          src={`/api/expenses/${expenseId}/email-body?format=${format}`}
          sandbox=""
          title="Original email"
          className="h-[32rem] w-full rounded-lg border border-border bg-white"
        />
      ) : (
        <p className="text-sm text-muted">The email body wasn’t kept for this expense.</p>
      )}
    </div>
  );
}
