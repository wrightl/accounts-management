import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildInvoiceLineValues,
  computePartAmountPence,
  resolveMilestoneAmountPence,
  validateInvoiceAmount,
} from "@/lib/orders/invoice-from-order";

describe("invoice-from-order", () => {
  it("resolves milestone percent amount", () => {
    expect(
      resolveMilestoneAmountPence(
        { amountPence: null, percentBasisPoints: 4000 },
        100000,
      ),
    ).toBe(40000);
  });

  it("computes part percent of order gross", () => {
    expect(
      computePartAmountPence({
        partMode: "percent",
        percent: "40",
        orderGrossPence: 100000,
      }),
    ).toBe(40000);
  });

  it("validates amount against remaining", () => {
    expect(validateInvoiceAmount(50000, 40000)).toMatch(/remaining/i);
  });

  it("uses summary line for part invoices", () => {
    const lines = buildInvoiceLineValues({
      mode: "part",
      amountPence: 25000,
      orderNumber: "O-2026-0001",
      orderLines: [],
      priorInvoicedPence: 0,
      company: { vatRegistered: true },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toContain("Part invoice");
    expect(lines[0]).toMatchObject({ taxCode: "zero_rated", vatRate: 0 });
  });

  it("copies order lines for first full remaining invoice", () => {
    const lines = buildInvoiceLineValues({
      mode: "remaining",
      amountPence: 100000,
      orderNumber: "O-2026-0001",
      orderLines: [
        {
          id: "1",
          orderId: "o1",
          description: "Build",
          quantity: 1,
          unitPricePence: 100000,
          vatRate: 0,
          taxCode: "exempt",
          taxCodeNeedsReview: false,
          discountPercent: 0,
          expenseId: null,
          position: 0,
        },
      ],
      priorInvoicedPence: 0,
      company: { vatRegistered: true },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe("Build");
    expect(lines[0]).toMatchObject({ taxCode: "exempt", vatRate: 0 });
  });

  const orderLine = (id: string, taxCode: "standard" | "zero_rated" | "exempt" | null, vatRate: number) => ({
    id,
    orderId: "o1",
    description: `Line ${id}`,
    quantity: 1,
    unitPricePence: 10_000,
    vatRate,
    taxCode,
    taxCodeNeedsReview: false,
    discountPercent: 0,
    position: Number(id),
  });

  it("keeps the order's code on a single-code part invoice", () => {
    const lines = buildInvoiceLineValues({
      mode: "part",
      amountPence: 12_000,
      orderNumber: "O-2026-0002",
      orderLines: [orderLine("1", "standard", 20), orderLine("2", "standard", 20)],
      priorInvoicedPence: 0,
      company: { vatRegistered: true },
    });
    expect(lines).toEqual([
      expect.objectContaining({ taxCode: "standard", vatRate: 20, unitPricePence: 10_000 }),
    ]);
  });

  it("keeps zero rated and exempt lines apart on a part invoice, though both are 0%", () => {
    const lines = buildInvoiceLineValues({
      mode: "part",
      amountPence: 10_000,
      orderNumber: "O-2026-0003",
      orderLines: [orderLine("1", "zero_rated", 0), orderLine("2", "exempt", 0)],
      priorInvoicedPence: 0,
      company: { vatRegistered: true },
    });
    expect(lines.map((l) => l.taxCode)).toEqual(["zero_rated", "exempt"]);
    expect(lines.reduce((n, l) => n + l.unitPricePence, 0)).toBe(10_000);
  });

  it("codes order lines saved before tax codes from their rate", () => {
    const lines = buildInvoiceLineValues({
      mode: "remaining",
      amountPence: 10_000,
      orderNumber: "O-2026-0004",
      orderLines: [orderLine("1", null, 0)],
      priorInvoicedPence: 0,
      company: { vatRegistered: false },
    });
    expect(lines[0]).toMatchObject({ taxCode: "outside_scope", vatRate: 0 });
  });
});
