import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { drawLogoPng, receiptFilename, renderReceiptPdf } = await import("@/lib/demo/files");

describe("demo files", () => {
  it("draws the logo as a valid PNG", () => {
    const png = drawLogoPng(64);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(64);
    expect(png.readUInt32BE(20)).toBe(64);
  });

  it("renders a receipt PDF", async () => {
    const receipt = {
      expenseId: "e1",
      supplier: "Hotel Albion",
      description: "Hotel — overnight for client workshop",
      date: "2026-10-14",
      amountPence: 13_800,
      vatPence: 2_300,
      vatRate: 20,
      usdCents: null,
    };
    const pdf = await renderReceiptPdf(receipt);
    expect(Buffer.from(pdf.subarray(0, 5)).toString("ascii")).toBe("%PDF-");
    expect(receiptFilename(receipt)).toBe("hotel-albion-2026-10-14.pdf");
  });
});
