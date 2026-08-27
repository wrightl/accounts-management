import { describe, expect, it } from "vitest";
import {
  receiptMagicOk,
  resolveReceiptContentType,
  sniffReceiptContentType,
  MAX_RECEIPT_BYTES,
  ALLOWED_RECEIPT_TYPES,
} from "@/lib/expenses/receipt-file";

describe("sniffReceiptContentType", () => {
  it("detects PDF from magic bytes", () => {
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0]);
    expect(sniffReceiptContentType(pdf)).toBe("application/pdf");
  });

  it("detects PNG from magic bytes", () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    expect(sniffReceiptContentType(png)).toBe("image/png");
  });
});

describe("resolveReceiptContentType", () => {
  it("sniffs PDF even when browser sends octet-stream", () => {
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0]);
    expect(resolveReceiptContentType(pdf)).toBe("application/pdf");
  });

  it("rejects unknown file contents", () => {
    expect(resolveReceiptContentType(Buffer.from("not-a-receipt"))).toBeNull();
  });
});

describe("receiptMagicOk", () => {
  it("accepts PNG magic bytes", () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    expect(receiptMagicOk(png)).toBe(true);
  });

  it("accepts PDF magic bytes", () => {
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0]);
    expect(receiptMagicOk(pdf)).toBe(true);
  });

  it("rejects mismatched content", () => {
    const buf = Buffer.from("not-a-png-file");
    expect(receiptMagicOk(buf)).toBe(false);
  });
});

describe("receipt file constants", () => {
  it("allows common receipt types", () => {
    expect(ALLOWED_RECEIPT_TYPES.has("image/jpeg")).toBe(true);
    expect(ALLOWED_RECEIPT_TYPES.has("application/pdf")).toBe(true);
  });

  it("sets 8 MB limit", () => {
    expect(MAX_RECEIPT_BYTES).toBe(8 * 1024 * 1024);
  });
});
