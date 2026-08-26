import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { getStorage } from "@/lib/storage";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export type LogoUploadResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

/** Validate and store a company logo; updates `companies.logoUrl`. */
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
  const contentType = file.type || "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    return { ok: false, error: "Logo must be an image" };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const storage = getStorage();
  const stored = await storage.put(
    `company/${companyId}/logo-${Date.now()}`,
    bytes,
    contentType,
  );

  const db = getDb();
  await db
    .update(companies)
    .set({ logoUrl: stored.path, updatedAt: new Date() })
    .where(eq(companies.id, companyId));

  return { ok: true, path: stored.path };
}
