import { describe, expect, it } from "vitest";
import {
  buildXlsx,
  columnName,
  sheetNames,
  tableColumnNames,
  uniqueTableNames,
} from "@/lib/xlsx/write";
import { readStoreZipEntries } from "@/lib/zip/store";

async function parts(...args: Parameters<typeof buildXlsx>) {
  const zip = await buildXlsx(...args);
  return new Map(
    readStoreZipEntries(zip).map(([name, data]) => [name, new TextDecoder().decode(data)]),
  );
}

describe("buildXlsx", () => {
  it("writes the parts Excel needs for each sheet", async () => {
    const files = await parts([
      { name: "Invoices", headers: ["id"], rows: [["a"]] },
      { name: "Payments", headers: ["id"], rows: [] },
    ]);

    expect([...files.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/tables/table1.xml",
      "xl/worksheets/_rels/sheet1.xml.rels",
      "xl/worksheets/sheet2.xml",
      "xl/tables/table2.xml",
      "xl/worksheets/_rels/sheet2.xml.rels",
    ]);
    expect(files.get("xl/workbook.xml")).toContain('<sheet name="Invoices" sheetId="1" r:id="rId1"/>');
    expect(files.get("xl/workbook.xml")).toContain('<sheet name="Payments" sheetId="2" r:id="rId2"/>');
    expect(files.get("[Content_Types].xml")).toContain('PartName="/xl/worksheets/sheet2.xml"');
    expect(files.get("xl/_rels/workbook.xml.rels")).toContain('Target="styles.xml"');
  });

  it("keeps formula-like text as text and escapes XML", async () => {
    const files = await parts([
      {
        name: "Bank",
        headers: ["payee"],
        rows: [['=HYPERLINK("https://evil.example")'], ["Fish & <Chips>"]],
      },
    ]);
    const sheet = files.get("xl/worksheets/sheet1.xml")!;

    expect(sheet).toContain(
      '<c r="A2" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;https://evil.example&quot;)</t></is></c>',
    );
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain("Fish &amp; &lt;Chips&gt;");
  });

  it("writes numbers as values, with money formatted", async () => {
    const files = await parts([
      { name: "Lines", headers: ["qty", "amount"], rows: [[{ value: 3 }, { value: -12.5, money: true }]] },
    ]);
    const sheet = files.get("xl/worksheets/sheet1.xml")!;

    expect(sheet).toContain('<c r="A2"><v>3</v></c>');
    expect(sheet).toContain('<c r="B2" s="1"><v>-12.5</v></c>');
    expect(files.get("xl/styles.xml")).toContain('formatCode="#,##0.00"');
  });

  it("links to another sheet's row and to files beside the workbook", async () => {
    const files = await parts([
      { name: "Invoices", headers: ["id"], rows: [["inv-1"], ["inv-2"]] },
      {
        name: "Payments",
        headers: ["invoice_id", "receipt", "online"],
        rows: [
          [
            { value: "inv-2", link: { sheet: "Invoices", row: 2 } },
            { value: "receipt", link: { file: "receipts/exp 1/a.jpg" } },
            { value: "Open in Alfa", link: { url: "https://alfa.test/api/receipts/r1?inline=1&x=1" } },
          ],
          [{ value: "gone", link: { sheet: "Missing", row: 1 } }, ""],
        ],
      },
    ]);
    const sheet = files.get("xl/worksheets/sheet2.xml")!;

    expect(sheet).toContain(`<hyperlink ref="A2" location="'Invoices'!A3"/>`);
    expect(sheet).toContain('<hyperlink ref="B2" r:id="rId1"/>');
    expect(sheet).not.toContain('ref="A3"');
    expect(files.get("xl/worksheets/_rels/sheet2.xml.rels")).toContain(
      'Target="receipts/exp%201/a.jpg" TargetMode="External"',
    );
    expect(sheet).toContain('<hyperlink ref="C2" r:id="rId2"/>');
    expect(files.get("xl/worksheets/_rels/sheet2.xml.rels")).toContain(
      'Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://alfa.test/api/receipts/r1?inline=1&amp;x=1" TargetMode="External"',
    );
    expect(files.get("xl/worksheets/_rels/sheet1.xml.rels")).not.toContain("hyperlink");
  });

  it("makes each sheet an Excel table under a frozen header", async () => {
    const files = await parts([
      { name: "P&L", headers: ["Item", "Value (£)"], rows: [["a", "b"], ["c", "d"]] },
    ]);
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    const table = files.get("xl/tables/table1.xml")!;

    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<tableParts count="1"><tablePart r:id="rId1"/></tableParts>');
    expect(files.get("xl/worksheets/_rels/sheet1.xml.rels")).toContain('Target="../tables/table1.xml"');
    expect(files.get("[Content_Types].xml")).toContain('PartName="/xl/tables/table1.xml"');
    expect(table).toContain('name="Table_PandL" displayName="Table_PandL" ref="A1:B3"');
    expect(table).toContain('<autoFilter ref="A1:B3"/>');
    expect(table).toContain('<tableColumn id="1" name="Item"/><tableColumn id="2" name="Value (£)"/>');
    // A sheet-level filter would overlap the table's and make Excel repair the file.
    expect(sheet).not.toContain("<autoFilter");
    expect(files.get("xl/workbook.xml")).not.toContain("_FilterDatabase");
  });

  it("numbers the table part after the sheet's hyperlinks", async () => {
    const files = await parts([
      { name: "Receipts", headers: ["File"], rows: [[{ value: "a.jpg", link: { file: "a.jpg" } }]] },
    ]);

    expect(files.get("xl/worksheets/sheet1.xml")).toContain('<tablePart r:id="rId2"/>');
    expect(files.get("xl/worksheets/_rels/sheet1.xml.rels")).toContain(
      'Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/>',
    );
  });

  it("gives an empty table a blank body row", async () => {
    const files = await parts([{ name: "Payments", headers: ["ID", "Amount (£)"], rows: [] }]);

    expect(files.get("xl/tables/table1.xml")).toContain('ref="A1:B2"');
  });
});

describe("sheetNames", () => {
  it("drops characters Excel refuses, truncates, and dedupes ignoring case", () => {
    expect(sheetNames(["a/b", "x".repeat(40), "Same", "same"])).toEqual([
      "a b",
      "x".repeat(31),
      "Same",
      "same (2)",
    ]);
  });
});

describe("tableColumnNames", () => {
  it("fills blanks and dedupes ignoring case, as Excel tables require", () => {
    expect(tableColumnNames(["ID", "", "id", "Notes"], 5)).toEqual([
      "ID",
      "Column 2",
      "id 2",
      "Notes",
      "Column 5",
    ]);
  });
});

describe("uniqueTableNames", () => {
  it("keeps names to letters, digits and underscores, and unique", () => {
    expect(uniqueTableNames(["P&L", "Bank transactions", "Bank-transactions"])).toEqual([
      "Table_PandL",
      "Table_Bank_transactions",
      "Table_Bank_transactions_2",
    ]);
  });
});

describe("columnName", () => {
  it("counts like spreadsheet columns", () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(columnName)).toEqual([
      "A",
      "Z",
      "AA",
      "AZ",
      "BA",
      "ZZ",
      "AAA",
    ]);
  });
});
