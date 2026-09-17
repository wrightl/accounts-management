import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getStorage } from "@/lib/storage";

const DEFAULT_LOGO_PATH = path.join(process.cwd(), "public/brand/logo.png");

/** Logo source suitable for @react-pdf Image (file path or data URI). */
export async function resolvePdfLogoSrc(logoUrl: string | null | undefined): Promise<string> {
  if (logoUrl) {
    try {
      const stored = await getStorage().get(logoUrl);
      const contentType = stored.contentType ?? "image/png";
      const base64 = Buffer.from(stored.body).toString("base64");
      return `data:${contentType};base64,${base64}`;
    } catch {
      // Fall through to bundled default logo.
    }
  }

  try {
    await readFile(DEFAULT_LOGO_PATH);
    return DEFAULT_LOGO_PATH;
  } catch {
    return DEFAULT_LOGO_PATH;
  }
}

/**
 * Company logo only for client-facing PDFs. Never falls back to the Dot + Dash
 * product mark — returns null when unset or unreadable.
 */
export async function resolveCompanyPdfLogoSrc(
  logoUrl: string | null | undefined,
): Promise<string | null> {
  if (!logoUrl) return null;
  try {
    const stored = await getStorage().get(logoUrl);
    const contentType = stored.contentType ?? "image/png";
    const base64 = Buffer.from(stored.body).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}
