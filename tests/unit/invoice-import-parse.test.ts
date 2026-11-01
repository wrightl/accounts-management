import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv/parse";
import { suggestClient, normalizeClientName } from "@/lib/invoices/import/clients";
import { suggestMapping, type ColumnMapping } from "@/lib/invoices/import/fields";
import {
  parseImportDate,
  parseInvoiceImport,
} from "@/lib/invoices/import/parse";

function parse(csv: string, mapping?: ColumnMapping, dateFormat: "dmy" | "mdy" = "dmy") {
  const headers = parseCsv(csv)[0];
  return parseInvoiceImport(csv, mapping ?? suggestMapping(headers), {
    dateFormat,
    paymentTermsDays: 14,
  });
}

const HEAD = "invoice number,client name,issue date,description,net,vat,status";

describe("parseCsv", () => {
  it("handles quoted commas, quotes and line breaks", () => {
    expect(parseCsv('a,b\n"one, two","say ""hi""\nthere"\r\n')).toEqual([
      ["a", "b"],
      ["one, two", 'say "hi"\nthere'],
    ]);
  });

  it("drops a byte order mark and blank rows", () => {
    expect(parseCsv("﻿a\n\n1\n,\n")).toEqual([["a"], ["1"]]);
  });
});

describe("parseImportDate", () => {
  it("rejects dates that don't exist", () => {
    expect(parseImportDate("31/02/2026", "dmy")).toBeNull();
    expect(parseImportDate("2026-13-45", "dmy")).toBeNull();
  });

  it("reads each format", () => {
    expect(parseImportDate("05/04/2026", "dmy")).toBe("2026-04-05");
    expect(parseImportDate("05/04/2026", "mdy")).toBe("2026-05-04");
    expect(parseImportDate("15 Jan 2026", "dmy")).toBe("2026-01-15");
    expect(parseImportDate("2026-01-15", "mdy")).toBe("2026-01-15");
    expect(parseImportDate("15/01/26", "dmy")).toBe("2026-01-15");
  });

  it("catches a day that contradicts the chosen format", () => {
    expect(parseImportDate("13/01/2026", "mdy")).toBeNull();
  });

  it("rejects spreadsheet serial numbers", () => {
    expect(parseImportDate("46000", "dmy")).toBeNull();
  });
});

describe("suggestMapping", () => {
  it("leaves ambiguous headers for the user", () => {
    const mapping = suggestMapping(["Amount", "Reference", "Invoice Number"]);
    expect(mapping.number).toBe("Invoice Number");
    expect(Object.values(mapping)).not.toContain("Amount");
    expect(Object.values(mapping)).not.toContain("Reference");
  });
});

describe("parseInvoiceImport", () => {
  it("groups rows by number with mixed VAT rates", () => {
    const { drafts } = parse(
      [
        "invoice number,client name,issue date,description,quantity,unit price,vat rate",
        "INV-1,Acme,01/02/2026,Design,1,100.00,20",
        "inv-1,Acme,01/02/2026,Print,2,50.00,0",
      ].join("\n"),
    );
    expect(drafts).toHaveLength(1);
    const { invoice, errors } = drafts[0];
    expect(errors).toEqual([]);
    expect(invoice.netPence).toBe(20_000);
    expect(invoice.vatPence).toBe(2_000);
    expect(invoice.grossPence).toBe(22_000);
    expect(invoice.lines.map((l) => l.vatRate)).toEqual([20, 0]);
  });

  it("keeps a percentage discount when it reproduces the line", () => {
    const { drafts } = parse(
      "invoice number,client name,issue date,description,quantity,unit price,discount\nI1,Acme,01/02/2026,Work,2,100.00,10",
    );
    expect(drafts[0].invoice.lines[0]).toMatchObject({
      quantity: 2,
      unitPricePence: 10_000,
      discountPercent: 10,
    });
    expect(drafts[0].invoice.netPence).toBe(18_000);
  });

  it("flattens a line whose amount doesn't reproduce", () => {
    const { drafts } = parse(
      "invoice number,client name,issue date,description,quantity,unit price,discount,line net\nI1,Acme,01/02/2026,Work,2,100.00,10,150.00",
    );
    expect(drafts[0].invoice.lines[0]).toMatchObject({
      quantity: 1,
      unitPricePence: 15_000,
      discountPercent: 0,
      description: "Work (after discount)",
    });
  });

  it("keeps source totals, including VAT for a company not registered today", () => {
    const { drafts } = parse(`${HEAD}\nI1,Acme,01/02/2026,Work,100.00,20.00,sent`);
    expect(drafts[0].invoice).toMatchObject({
      netPence: 10_000,
      vatPence: 2_000,
      grossPence: 12_000,
    });
    expect(drafts[0].invoice.lines[0].vatRate).toBe(20);
  });

  it("flags a rate it can only approximate, without changing the totals", () => {
    const { drafts } = parse(`${HEAD}\nI1,Acme,01/02/2026,Work,100.00,17.50,sent`);
    expect(drafts[0].invoice.vatPence).toBe(1_750);
    expect(drafts[0].warnings.join()).toContain("approximate");
  });

  it("errors when lines don't add up to the header", () => {
    const { drafts } = parse(
      "invoice number,client name,issue date,description,line net,net\nI1,Acme,01/02/2026,A,10.00,50.00\nI1,Acme,01/02/2026,B,10.00,50.00",
    );
    expect(drafts[0].errors.join()).toContain("don't add up");
  });

  it("errors when rows for one invoice disagree", () => {
    const { drafts } = parse(
      "invoice number,client name,issue date,description,line net\nI1,Acme,01/02/2026,A,10.00\nI1,Other,01/02/2026,B,10.00",
    );
    expect(drafts[0].errors.join()).toContain("disagree");
  });

  it("rejects negative totals and negative VAT", () => {
    const { drafts } = parse(
      `${HEAD}\nI1,Acme,01/02/2026,Work,-100.00,,sent\nI2,Acme,01/02/2026,Work,100.00,-20.00,sent`,
    );
    expect(drafts[0].errors.join()).toContain("credit note");
    expect(drafts[1].errors.join()).toContain("negative");
  });

  it("reads bracketed negatives", () => {
    const { drafts } = parse(`${HEAD}\nI1,Acme,01/02/2026,Work,(100.00),,sent`);
    expect(drafts[0].errors.join()).toContain("credit note");
  });

  it("errors on overpayment rather than clamping it", () => {
    const { drafts } = parse(
      "invoice number,client name,issue date,description,net,amount paid\nI1,Acme,01/02/2026,Work,100.00,150.00",
    );
    expect(drafts[0].errors.join()).toContain("more than");
  });

  it("treats fully paid amounts as paid, and part-paid 'paid' as open", () => {
    const { drafts } = parse(
      "invoice number,client name,issue date,description,net,status,amount paid,paid date\nI1,Acme,01/02/2026,W,100.00,,100.00,05/02/2026\nI2,Acme,01/02/2026,W,100.00,paid,40.00,05/02/2026",
    );
    expect(drafts[0].invoice.status).toBe("paid");
    expect(drafts[1].invoice.status).toBe("sent");
    expect(drafts[1].warnings.join()).toContain("part still owed");
  });

  it("reads amount due as the balance", () => {
    const { drafts } = parse(
      "invoice number,client name,issue date,description,gross,amount due\nI1,Acme,01/02/2026,W,120.00,20.00",
    );
    expect(drafts[0].invoice.amountPaidPence).toBe(10_000);
  });

  it("warns about missing or odd dates and a missing number", () => {
    const { drafts } = parse(
      "invoice number,client name,issue date,due date,description,net,amount paid\n,Acme,10/02/2026,01/02/2026,W,100.00,100.00",
    );
    const warnings = drafts[0].warnings.join();
    expect(warnings).toContain("No paid date");
    expect(warnings).toContain("Due date is before");
    expect(warnings).toContain("No invoice number");
  });

  it("skips non-GBP, draft and void rows with a reason", () => {
    const { drafts, skipped } = parse(
      "invoice number,client name,issue date,description,net,status,currency\nE1,Acme,01/02/2026,W,10.00,sent,EUR\nD1,Acme,01/02/2026,W,10.00,draft,GBP\nV1,Acme,01/02/2026,W,10.00,void,GBP\nG1,Acme,01/02/2026,W,10.00,sent,GBP",
    );
    expect(drafts).toHaveLength(1);
    expect(skipped.map((s) => s.number)).toEqual(["E1", "D1", "V1"]);
    expect(skipped[0].reason).toContain("EUR");
  });

  it("errors on an unknown status or missing client", () => {
    const { drafts } = parse(
      `${HEAD}\nI1,Acme,01/02/2026,W,10.00,,maybe\nI2,,01/02/2026,W,10.00,,sent`,
    );
    expect(drafts[0].errors.join()).toContain("Unknown status");
    expect(drafts[1].errors.join()).toContain("client");
  });

  it("defaults the due date from payment terms", () => {
    const { drafts } = parse(`${HEAD}\nI1,Acme,01/02/2026,W,10.00,,sent`);
    expect(drafts[0].invoice.dueDate).toBe("2026-02-15");
  });
});

describe("suggestClient", () => {
  const existing = [
    { id: "c1", name: "Jane", companyName: "Acme Ltd", email: "jane@acme.example" },
    { id: "c2", name: "Bob", companyName: "Northern Widgets", email: null },
  ];
  const client = (over: object) => ({
    key: "k",
    name: null,
    companyName: null,
    email: null,
    address: null,
    ...over,
  });

  it("strips company suffixes", () => {
    expect(normalizeClientName("The Acme Limited")).toBe("acme");
  });

  it("links on email", () => {
    expect(suggestClient(client({ email: "jane@acme.example" }), existing)).toMatchObject({
      clientId: "c1",
      basis: "email",
      preselect: true,
    });
  });

  it("links on an exact name ignoring suffixes", () => {
    expect(suggestClient(client({ companyName: "ACME LIMITED" }), existing)).toMatchObject({
      clientId: "c1",
      basis: "name",
      preselect: true,
    });
  });

  it("only offers a similar name", () => {
    expect(suggestClient(client({ companyName: "Northern Widget" }), existing)).toMatchObject({
      clientId: "c2",
      basis: "similar",
      preselect: false,
    });
  });

  it("creates when nothing is close", () => {
    expect(suggestClient(client({ name: "Zed" }), existing).clientId).toBeNull();
  });
});
