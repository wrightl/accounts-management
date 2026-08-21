import "server-only";
import { serverEnv } from "@/env";

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  attachments?: EmailAttachment[];
}

export interface EmailResult {
  id: string | null;
}

/**
 * Transport-agnostic email sender. Implementations live alongside this file so
 * the provider (Resend today) can be swapped without touching call sites.
 */
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailResult>;
}

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  const { EMAIL_PROVIDER } = serverEnv();
  cached =
    EMAIL_PROVIDER === "resend"
      ? new ResendProvider()
      : new ConsoleProvider();
  return cached;
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const provider = getEmailProvider();
  const from = message.from ?? serverEnv().EMAIL_FROM;
  return provider.send({ ...message, from });
}

/** Development / test transport: logs instead of sending. */
class ConsoleProvider implements EmailProvider {
  readonly name = "console";
  async send(message: EmailMessage): Promise<EmailResult> {
    console.info(
      `[email:console] to=${String(message.to)} subject="${message.subject}"`,
    );
    return { id: null };
  }
}

class ResendProvider implements EmailProvider {
  readonly name = "resend";
  async send(message: EmailMessage): Promise<EmailResult> {
    const { RESEND_API_KEY } = serverEnv();
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
    }
    const { Resend } = await import("resend");
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: message.from!,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text ?? "",
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });
    if (error) throw new Error(`Resend error: ${error.message}`);
    return { id: data?.id ?? null };
  }
}
