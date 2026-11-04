import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { isLogoContentType } from "@/lib/company-logo-file";
import { sniffReceiptContentType } from "@/lib/expenses/receipt-file";
import { getStorage } from "@/lib/storage";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export type LogoUploadResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

/**
 * Validate and store a company logo; updates `companies.logoUrl`. The type
 * stored is read from the file's bytes, never the name or what the browser
 * says it is.
 */
export async function storeCompanyLogo(
  companyId: string,
  file: File,
): Promise<LogoUploadResult> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image file" };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, error: "Logo must be under 2 MB" };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = sniffReceiptContentType(bytes);
  if (!isLogoContentType(contentType)) {
    return { ok: false, error: "Logo must be a PNG, JPEG, WebP or GIF image" };
  }

  const storage = getStorage();
  const stored = await storage.put(
    `company/${companyId}/logo-${Date.now()}`,
    bytes,
    contentType!,
  );

  const db = getDb();
  await db
    .update(companies)
    .set({ logoUrl: stored.path, updatedAt: new Date() })
    .where(eq(companies.id, companyId));

  return { ok: true, path: stored.path };
}
