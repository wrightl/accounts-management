import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECEIPT_OCR_MODEL,
  FALLBACK_RECEIPT_OCR_MODELS,
  isGatewayModelId,
  normalizeReceiptOcrModel,
  receiptOcrModelOptions,
  selectReceiptOcrModels,
} from "@/lib/expenses/receipt-ocr-models";

describe("isGatewayModelId", () => {
  it("accepts provider/model slugs", () => {
    expect(isGatewayModelId("google/gemini-2.5-flash")).toBe(true);
    expect(isGatewayModelId("anthropic/claude-sonnet-4.6")).toBe(true);
    expect(isGatewayModelId("openai/gpt-5.4-mini")).toBe(true);
  });

  it("rejects incomplete or oversized ids", () => {
    expect(isGatewayModelId("gemini-2.5-flash")).toBe(false);
    expect(isGatewayModelId("google/")).toBe(false);
    expect(isGatewayModelId("")).toBe(false);
    expect(isGatewayModelId(`google/${"a".repeat(200)}`)).toBe(false);
  });
});

describe("normalizeReceiptOcrModel", () => {
  it("falls back to the default model", () => {
    expect(normalizeReceiptOcrModel(undefined)).toBe(DEFAULT_RECEIPT_OCR_MODEL);
    expect(normalizeReceiptOcrModel("not-a-model")).toBe(DEFAULT_RECEIPT_OCR_MODEL);
    expect(normalizeReceiptOcrModel(" openai/gpt-5.4 ")).toBe("openai/gpt-5.4");
  });
});

describe("selectReceiptOcrModels", () => {
  it("keeps vision language models that read images and PDFs", () => {
    const selected = selectReceiptOcrModels([
      {
        id: "google/gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        type: "language",
        owned_by: "google",
        tags: ["vision"],
        modalities: { input: ["text", "image", "pdf"], output: ["text"] },
        released: 2,
      },
      {
        id: "google/gemini-3.1-flash-image",
        name: "Nano Banana",
        type: "language",
        owned_by: "google",
        tags: ["vision", "image-generation"],
        modalities: { input: ["text", "image"], output: ["text", "image"] },
        released: 3,
      },
      {
        id: "openai/gpt-5.3-codex",
        name: "GPT 5.3 Codex",
        type: "language",
        owned_by: "openai",
        tags: ["vision"],
        modalities: { input: ["text", "image", "pdf"], output: ["text"] },
        released: 4,
      },
      {
        id: "anthropic/claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        type: "language",
        owned_by: "anthropic",
        tags: ["vision"],
        modalities: { input: ["text", "image", "pdf"], output: ["text"] },
        released: 5,
      },
      {
        id: "alibaba/qwen-3-14b",
        name: "Qwen",
        type: "language",
        owned_by: "alibaba",
        tags: ["vision"],
        modalities: { input: ["text", "image", "pdf"], output: ["text"] },
        released: 6,
      },
    ]);

    expect(selected.map((m) => m.id)).toEqual([
      "google/gemini-2.5-flash",
      "anthropic/claude-sonnet-4.6",
    ]);
  });
});

describe("receiptOcrModelOptions", () => {
  it("prepends a saved model that is not in the catalog", () => {
    const options = receiptOcrModelOptions(FALLBACK_RECEIPT_OCR_MODELS, "openai/gpt-5.5");
    expect(options[0]).toEqual({ id: "openai/gpt-5.5", name: "openai/gpt-5.5" });
  });
});
