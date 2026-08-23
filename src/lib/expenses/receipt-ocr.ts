import { generateText, Output } from "ai";
import { z } from "zod";
import { serverEnv } from "@/env";
import { EXPENSE_CATEGORIES } from "@/lib/expenses/categories";
import { normalizeReceiptOcrModel } from "@/lib/expenses/receipt-ocr-models";
import {
  extractPdfText,
  isPdfBytes,
  renderPdfFirstPagePng,
} from "@/lib/expenses/receipt-pdf";
import {
  normalizeAiExtraction,
  parseReceiptText,
  type ReceiptExtraction,
} from "@/lib/expenses/receipt-parse";

export type ReceiptOcrProvider = "local" | "ai_gateway";

function isPdfContent(bytes: Buffer, contentType: string): boolean {
  return contentType === "application/pdf" || isPdfBytes(bytes);
}

async function runTesseractOnImage(imageBytes: Buffer): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(imageBytes);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}

async function extractPdfTextWithFallback(bytes: Buffer): Promise<string> {
  let text = "";
  try {
    text = await extractPdfText(bytes);
  } catch (error) {
    console.error(
      "[receipt-ocr] PDF text extraction failed:",
      error instanceof Error ? error.message : error,
    );
  }

  if (text.trim()) {
    return text;
  }

  try {
    const png = await renderPdfFirstPagePng(bytes);
    return runTesseractOnImage(png);
  } catch (error) {
    console.error(
      "[receipt-ocr] PDF OCR fallback failed:",
      error instanceof Error ? error.message : error,
    );
    return "";
  }
}

async function runLocalOcr(bytes: Buffer, contentType: string): Promise<ReceiptExtraction> {
  let text = "";

  if (isPdfContent(bytes, contentType)) {
    text = await extractPdfTextWithFallback(bytes);
  } else {
    try {
      text = await runTesseractOnImage(bytes);
    } catch (error) {
      console.error(
        "[receipt-ocr] Image OCR failed:",
        error instanceof Error ? error.message : error,
      );
      return { confidence: "none" };
    }
  }

  if (!text.trim()) {
    return { confidence: "none" };
  }

  return parseReceiptText(text);
}

async function runAiGatewayOcr(
  bytes: Buffer,
  contentType: string,
  model: string,
): Promise<ReceiptExtraction> {
  const apiKey = serverEnv().AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI Gateway is not configured. Add AI_GATEWAY_API_KEY or switch to Local OCR in Settings.",
    );
  }

  const schema = z.object({
    merchant: z.string().nullable(),
    description: z.string().nullable(),
    amountPounds: z.string().nullable(),
    spentAt: z.string().nullable(),
    category: z.enum(EXPENSE_CATEGORIES).nullable(),
  });

  const mediaType = isPdfContent(bytes, contentType) ? "application/pdf" : contentType;
  const filePart =
    mediaType === "application/pdf"
      ? { type: "file" as const, data: bytes, mediaType }
      : { type: "image" as const, image: bytes, mediaType };

  const { output } = await generateText({
    model,
    output: Output.object({ schema }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract expense details from this UK receipt. Return JSON fields:
- merchant: store or vendor name
- description: short expense description (merchant + brief context)
- amountPounds: total paid in GBP as decimal string e.g. "12.50"
- spentAt: transaction date as YYYY-MM-DD if visible
- category: best match from ${EXPENSE_CATEGORIES.join(", ")}
Use null for any field you cannot determine confidently.`,
          },
          filePart,
        ],
      },
    ],
  });

  return normalizeAiExtraction(output);
}

export async function extractReceiptFromBytes(
  bytes: Buffer,
  contentType: string,
  provider: ReceiptOcrProvider,
  model?: string,
): Promise<ReceiptExtraction> {
  if (provider === "ai_gateway") {
    return runAiGatewayOcr(bytes, contentType, normalizeReceiptOcrModel(model));
  }
  return runLocalOcr(bytes, contentType);
}
