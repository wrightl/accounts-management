import { describe, expect, it } from "vitest";
import {
  invoiceImportHasErrors,
  parseInvoiceImportCsv,
  type InvoiceImportContext,
} from "@/lib/invoices/import-csv";

const baseCtx = (): InvoiceImportContext => ({
  fyStart: "2026-04-01",
  vatRegistered: true,
  existingNumbers: new Set(),
  paymentTermsDays: 14,
});

describe("parseInvoiceImportCsv", () => {
  it("accepts open invoices before the current FY", () => {
    const csv = [
      "client_name,issue_date,description,net_gbp,vat_gbp,status",
      "Acme,2025-06-01,Old open work,1000.00,200.00,sent",
    ].join("\n");
    const rows = parseInvoiceImportCsv(csv, baseCtx());
    expect(rows[0].errors).toHaveLength(0);
    expect(rows[0].status).toBe("sent");
  });

  it("rejects fully paid invoices before the current FY", () => {
    const csv = [
      "client_email,issue_date,description,net_gbp,vat_gbp,status,amount_paid_gbp",
      "a@b.com,2025-06-01,Old paid,1000.00,200.00,paid,1200.00",
    ].join("\n");
    const rows = parseInvoiceImportCsv(csv, baseCtx());
    expect(rows[0].errors.some((e) => e.includes("financial year"))).toBe(
      true,
    );
    expect(invoiceImportHasErrors(rows)).toBe(true);
  });

  it("accepts fully paid invoices in the current FY", () => {
    const csv = [
      "client_name,issue_date,description,net_gbp,vat_gbp,status,amount_paid_gbp,paid_at",
      "Acme,2026-05-01,FY paid,1000.00,200.00,paid,1200.00,2026-05-10",
    ].join("\n");
    const rows = parseInvoiceImportCsv(csv, baseCtx());
    expect(rows[0].errors).toHaveLength(0);
    expect(rows[0].status).toBe("paid");
    expect(rows[0].amountPaidPence).toBe(120000);
  });

  it("accepts partly paid invoices before FY", () => {
    const csv = [
      "client_name,issue_date,description,net_gbp,vat_gbp,amount_paid_gbp",
      "Acme,2025-01-15,Part paid,1000.00,200.00,400.00",
    ].join("\n");
    const rows = parseInvoiceImportCsv(csv, baseCtx());
    expect(rows[0].errors).toHaveLength(0);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].amountPaidPence).toBe(40000);
  });

  it("rejects void and duplicate numbers", () => {
    const csv = [
      "client_name,issue_date,description,net_gbp,number,status",
      "Acme,2026-05-01,A,100.00,DD-2026-0001,void",
      "Acme,2026-05-02,B,100.00,DD-2026-0001,sent",
    ].join("\n");
    const rows = parseInvoiceImportCsv(csv, {
      ...baseCtx(),
      existingNumbers: new Set(["dd-2026-0099"]),
    });
    expect(rows[0].errors.some((e) => e.includes("void"))).toBe(true);
    expect(rows[1].errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("forces VAT to 0 when not VAT registered", () => {
    const csv = [
      "client_name,issue_date,description,net_gbp,vat_gbp",
      "Acme,2026-05-01,Work,100.00,20.00",
    ].join("\n");
    const rows = parseInvoiceImportCsv(csv, {
      ...baseCtx(),
      vatRegistered: false,
    });
    expect(rows[0].vatPence).toBe(0);
    expect(rows[0].grossPence).toBe(10000);
  });

  it("defaults overdue status to sent", () => {
    const csv = [
      "client_name,issue_date,description,net_gbp,status",
      "Acme,2026-05-01,Work,100.00,overdue",
    ].join("\n");
    const rows = parseInvoiceImportCsv(csv, baseCtx());
    expect(rows[0].status).toBe("sent");
  });
});
