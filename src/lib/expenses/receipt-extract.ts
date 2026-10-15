import "server-only";
import { parseReceiptFileAsync } from "@/lib/expenses/receipt-file";
import {
  extractReceiptFromBytes,
  type ReceiptOcrProvider,
} from "@/lib/expenses/receipt-ocr";
import {
  isReceiptOcrProvider,
  type ReceiptExtraction,
} from "@/lib/expenses/receipt-parse";
import { getReceiptOcrSettings } from "@/lib/platform-settings";

export type ReceiptExtractionResult =
  | { ok: true; extraction: ReceiptExtraction }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Read description, amount, date and category from an uploaded receipt with
 * the platform's OCR settings. Shared by the web form and the mobile app.
 * Callers handle authz.
 */
export async function readReceiptFields(
  formData: FormData,
  fieldName = "receipt",
): Promise<ReceiptExtractionResult> {
  const parsed = await parseReceiptFileAsync(formData, fieldName);
  if (!parsed.ok) return parsed;

  const ocr = await getReceiptOcrSettings();
  const providerRaw = ocr.provider ?? "local";
  const provider: ReceiptOcrProvider = isReceiptOcrProvider(providerRaw)
    ? providerRaw
    : "local";

  try {
    const extraction = await extractReceiptFromBytes(
      parsed.data.bytes,
      parsed.data.contentType,
      provider,
      ocr.model,
    );
    return { ok: true, extraction };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not read receipt",
    };
  }
}
