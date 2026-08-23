import "server-only";
import {
  FALLBACK_RECEIPT_OCR_MODELS,
  selectReceiptOcrModels,
  type GatewayCatalogModel,
  type ReceiptOcrModelOption,
} from "@/lib/expenses/receipt-ocr-models";

const MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";

export async function listReceiptOcrGatewayModels(): Promise<ReceiptOcrModelOption[]> {
  try {
    const res = await fetch(MODELS_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return FALLBACK_RECEIPT_OCR_MODELS;
    const body = (await res.json()) as { data?: GatewayCatalogModel[] };
    const selected = selectReceiptOcrModels(Array.isArray(body.data) ? body.data : []);
    return selected.length > 0 ? selected : FALLBACK_RECEIPT_OCR_MODELS;
  } catch {
    return FALLBACK_RECEIPT_OCR_MODELS;
  }
}
