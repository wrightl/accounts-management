import "server-only";
import { getStorage } from "@/lib/storage";

/**
 * Company logo only for client-facing PDFs. Never falls back to the Alfa
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
