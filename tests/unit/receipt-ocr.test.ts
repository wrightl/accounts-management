import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRecognize = vi.fn(async () => ({
  data: { text: "Pret A Manger\n23/08/2026\nTOTAL £5.20" },
}));
const mockTerminate = vi.fn();
const mockCreateWorker = vi.fn(async () => ({
  recognize: mockRecognize,
  terminate: mockTerminate,
}));
const mockGenerateText = vi.hoisted(() => vi.fn());
const mockServerEnv = vi.hoisted(() =>
  vi.fn(() => ({ AI_GATEWAY_API_KEY: undefined as string | undefined })),
);
const mockExtractPdfText = vi.hoisted(() => vi.fn());
const mockRenderPdfFirstPagePng = vi.hoisted(() => vi.fn());
const mockIsPdfBytes = vi.hoisted(() => vi.fn());

vi.mock("tesseract.js", () => ({
  createWorker: mockCreateWorker,
}));

vi.mock("@/env", () => ({
  serverEnv: mockServerEnv,
}));

vi.mock("ai", () => ({
  generateText: mockGenerateText,
  Output: { object: (opts: unknown) => opts },
}));

vi.mock("@/lib/expenses/receipt-pdf", () => ({
  extractPdfText: mockExtractPdfText,
  renderPdfFirstPagePng: mockRenderPdfFirstPagePng,
  isPdfBytes: mockIsPdfBytes,
}));

import { extractReceiptFromBytes } from "@/lib/expenses/receipt-ocr";

const MICROSOFT_INVOICE_TEXT = `Billing Summary

Microsoft Limited
Document Date
 
09/07/2026

Total Amount

GBP 70.07`;

describe("extractReceiptFromBytes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPdfBytes.mockImplementation(
      (bytes: Buffer) => bytes.subarray(0, 5).toString("latin1") === "%PDF-",
    );
  });

  it("uses local tesseract path for images", async () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    const result = await extractReceiptFromBytes(png, "image/png", "local");
    expect(mockCreateWorker).toHaveBeenCalled();
    expect(mockExtractPdfText).not.toHaveBeenCalled();
    expect(result.amountPounds).toBe("5.20");
    expect(result.description).toBe("Pret A Manger");
  });

  it("uses pdf text extraction for PDFs", async () => {
    mockExtractPdfText.mockResolvedValueOnce(MICROSOFT_INVOICE_TEXT);
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0]);
    const result = await extractReceiptFromBytes(pdf, "application/pdf", "local");
    expect(mockExtractPdfText).toHaveBeenCalled();
    expect(mockCreateWorker).not.toHaveBeenCalled();
    expect(result.description).toBe("Microsoft Limited");
    expect(result.amountPounds).toBe("70.07");
    expect(result.spentAt).toBe("2026-07-09");
  });

  it("falls back to tesseract when pdf text is empty", async () => {
    mockExtractPdfText.mockResolvedValueOnce("");
    mockRenderPdfFirstPagePng.mockResolvedValueOnce(Buffer.from("png-bytes"));
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0]);
    const result = await extractReceiptFromBytes(pdf, "application/pdf", "local");
    expect(mockRenderPdfFirstPagePng).toHaveBeenCalled();
    expect(mockCreateWorker).toHaveBeenCalled();
    expect(result.amountPounds).toBe("5.20");
  });

  it("sniffs PDF bytes even when MIME type is wrong", async () => {
    mockExtractPdfText.mockResolvedValueOnce(MICROSOFT_INVOICE_TEXT);
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0]);
    const result = await extractReceiptFromBytes(pdf, "application/octet-stream", "local");
    expect(mockExtractPdfText).toHaveBeenCalled();
    expect(result.amountPounds).toBe("70.07");
  });

  it("throws when AI Gateway key is missing", async () => {
    mockServerEnv.mockReturnValueOnce({ AI_GATEWAY_API_KEY: undefined });
    const png = Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    await expect(
      extractReceiptFromBytes(png, "image/png", "ai_gateway"),
    ).rejects.toThrow(/AI Gateway is not configured/);
  });

  it("sends the configured gateway model to generateText", async () => {
    mockServerEnv.mockReturnValueOnce({ AI_GATEWAY_API_KEY: "test-key" });
    mockGenerateText.mockResolvedValueOnce({
      output: {
        merchant: "Pret A Manger",
        description: "Coffee",
        amountPounds: "5.20",
        spentAt: "2026-08-23",
        category: "Meals",
      },
    });
    const png = Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const result = await extractReceiptFromBytes(
      png,
      "image/jpeg",
      "ai_gateway",
      "openai/gpt-5.4",
    );
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: "openai/gpt-5.4" }),
    );
    expect(result.amountPounds).toBe("5.20");
    expect(result.category).toBe("Meals");
  });
});
