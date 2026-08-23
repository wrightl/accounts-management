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
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toContain("Part invoice");
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
          position: 0,
        },
      ],
      priorInvoicedPence: 0,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toBe("Build");
  });
});
