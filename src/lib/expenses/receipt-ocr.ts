import { generateText, Output } from "ai";
import type { Worker as TesseractWorker } from "tesseract.js";
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

/** Turns an image into text; lets a batch share one Tesseract worker. */
export type ImageOcr = (imageBytes: Buffer) => Promise<string>;

export type ReceiptOcrOptions = {
  ocrImage?: ImageOcr;
  /** Cancels an AI Gateway request (e.g. when a job's time budget runs out). */
  abortSignal?: AbortSignal;
};

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

/**
 * Tesseract workers shared across many images. Starting a worker loads the
 * language data, which costs more than recognising a typical receipt, so a
 * batch (an email's attachments) reuses up to `size` of them, started as
 * needed. Call `close` when done.
 */
export function createSharedImageOcr(size = 1): {
  ocrImage: ImageOcr;
  close: () => Promise<void>;
} {
  type Slot = { worker: Promise<TesseractWorker>; busy: number };
  const slots: Slot[] = [];
  let tesseract: Promise<typeof import("tesseract.js")> | null = null;
  const pickSlot = (): Slot => {
    const idle = slots.find((slot) => slot.busy === 0);
    if (idle) return idle;
    if (slots.length < size) {
      const slot: Slot = {
        worker: (tesseract ??= import("tesseract.js")).then(({ createWorker }) =>
          createWorker("eng"),
        ),
        busy: 0,
      };
      slots.push(slot);
      return slot;
    }
    // All busy: queue on the least loaded worker.
    return slots.reduce((a, b) => (b.busy < a.busy ? b : a));
  };
  return {
    ocrImage: async (imageBytes) => {
      const slot = pickSlot();
      slot.busy++;
      try {
        const result = await (await slot.worker).recognize(imageBytes);
        return result.data.text;
      } finally {
        slot.busy--;
      }
    },
    close: async () => {
      const closing = slots.splice(0);
      await Promise.all(
        closing.map(async (slot) => {
          try {
            await (await slot.worker).terminate();
          } catch {
            // Worker failed to start; nothing to stop.
          }
        }),
      );
    },
  };
}

async function extractPdfTextWithFallback(bytes: Buffer, ocrImage: ImageOcr): Promise<string> {
  let text = "";
  try {
    text = await extractPdfText(bytes);
  } catch (error) {
    console.error(
      "[receipt-ocr] PDF text extraction failed:",
      error instanceof Error ? error.message : error,
    );
    void import("@/lib/platform-log").then(({ logPlatformEvent }) =>
      logPlatformEvent({
        level: "error",
        source: "receipt-ocr.pdf_text",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  if (text.trim()) {
    return text;
  }

  try {
    const png = await renderPdfFirstPagePng(bytes);
    return await ocrImage(png);
  } catch (error) {
    console.error(
      "[receipt-ocr] PDF OCR fallback failed:",
      error instanceof Error ? error.message : error,
    );
    return "";
  }
}

async function runLocalOcr(
  bytes: Buffer,
  contentType: string,
  ocrImage: ImageOcr,
): Promise<ReceiptExtraction> {
  let text = "";

  if (isPdfContent(bytes, contentType)) {
    text = await extractPdfTextWithFallback(bytes, ocrImage);
  } else {
    try {
      text = await ocrImage(bytes);
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
  abortSignal?: AbortSignal,
): Promise<ReceiptExtraction> {
  const apiKey = serverEnv().AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI Gateway is not configured. Add AI_GATEWAY_API_KEY or switch to Local OCR in Platform settings.",
    );
  }

  const schema = z.object({
    merchant: z.string().nullable(),
    description: z.string().nullable(),
    amountPounds: z.string().nullable(),
    spentAt: z.string().nullable(),
    category: z.enum(EXPENSE_CATEGORIES).nullable(),
    currency: z.string().nullable(),
  });

  const mediaType = isPdfContent(bytes, contentType) ? "application/pdf" : contentType;
  const filePart =
    mediaType === "application/pdf"
      ? { type: "file" as const, data: bytes, mediaType }
      : { type: "image" as const, image: bytes, mediaType };

  const { output } = await generateText({
    model,
    abortSignal,
    output: Output.object({ schema }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract expense details from this receipt. Return JSON fields:
- merchant: store or vendor name
- description: short expense description (merchant + brief context)
- amountPounds: total paid as a decimal string e.g. "12.50" (numeric amount only)
- spentAt: transaction date as YYYY-MM-DD if visible. Read numeric dates in the receipt's own convention: US receipts are month first (MM/DD/YYYY), UK and most others day first.
- category: best match from ${EXPENSE_CATEGORIES.join(", ")}
- currency: ISO 4217 currency code of the total (e.g. GBP, USD, EUR). Use null if unclear.
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
  options: ReceiptOcrOptions = {},
): Promise<ReceiptExtraction> {
  if (provider === "ai_gateway") {
    return runAiGatewayOcr(
      bytes,
      contentType,
      normalizeReceiptOcrModel(model),
      options.abortSignal,
    );
  }
  return runLocalOcr(bytes, contentType, options.ocrImage ?? runTesseractOnImage);
}
