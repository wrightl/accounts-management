import { zipStore } from "@/lib/zip/store";

/**
 * A link to another sheet's row (1-based, after the header), to a file beside
 * the workbook (a relative path), or to a web address.
 */
export type XlsxLink = { sheet: string; row: number } | { file: string } | { url: string };

export type XlsxCell =
  | string
  | { value: string | number; money?: boolean; link?: XlsxLink };

export type XlsxSheet = { name: string; headers: string[]; rows: XlsxCell[][] };

const MAX_CELL_TEXT = 32_767;
const MAX_LINKS_PER_SHEET = 65_530;
const MAX_WIDTH = 60;

const STYLE = { header: 1, money: 2, link: 3 } as const;

const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/**
 * A minimal .xlsx: one sheet per table, bold frozen header with a filter, money
 * as numbers, and hyperlinks to other sheets' rows or to files beside the
 * workbook. Text is written as inline strings, which Excel never runs as a
 * formula, so outside text like `=HYPERLINK(...)` stays text.
 */
export async function buildXlsx(sheets: XlsxSheet[]): Promise<Uint8Array> {
  const names = sheetNames(sheets.map((s) => s.name));
  const nameOf = new Map(sheets.map((s, i) => [s.name, names[i]]));

  const parts: [string, string][] = [
    ["[Content_Types].xml", contentTypes(sheets.length)],
    [
      "_rels/.rels",
      rels([{ type: `${NS_REL}/officeDocument`, target: "xl/workbook.xml" }]),
    ],
    ["xl/workbook.xml", workbook(sheets, names)],
    [
      "xl/_rels/workbook.xml.rels",
      rels([
        ...sheets.map((_, i) => ({
          type: `${NS_REL}/worksheet`,
          target: `worksheets/sheet${i + 1}.xml`,
        })),
        { type: `${NS_REL}/styles`, target: "styles.xml" },
      ]),
    ],
    ["xl/styles.xml", STYLES],
  ];
  sheets.forEach((sheet, i) => {
    const { xml, externalLinks } = worksheet(sheet, nameOf);
    parts.push([`xl/worksheets/sheet${i + 1}.xml`, xml]);
    if (externalLinks.length > 0) {
      parts.push([
        `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
        rels(
          externalLinks.map((target) => ({
            type: `${NS_REL}/hyperlink`,
            target,
            external: true,
          })),
        ),
      ]);
    }
  });

  return zipStore(parts, "Workbook");
}

function worksheet(sheet: XlsxSheet, nameOf: Map<string, string>) {
  const width = sheetWidth(sheet);
  const widths = sheet.headers.map((h) => h.length);
  const links: string[] = [];
  const externalLinks: string[] = [];

  const rowXml = (cells: XlsxCell[], rowNumber: number, header: boolean) => {
    const out = cells.map((cell, col) => {
      const ref = `${columnName(col)}${rowNumber}`;
      const { value, money, link } =
        typeof cell === "string" ? { value: cell } : cell;
      const text = String(value);
      widths[col] = Math.max(widths[col] ?? 0, text.length);

      let style = header ? STYLE.header : money ? STYLE.money : 0;
      const target =
        link && text !== "" && links.length < MAX_LINKS_PER_SHEET
          ? linkTarget(link, nameOf)
          : null;
      if (target && "location" in target) {
        links.push(`<hyperlink ref="${ref}" location="${xmlEscape(target.location)}"/>`);
        style = STYLE.link;
      } else if (target) {
        externalLinks.push(target.external);
        links.push(`<hyperlink ref="${ref}" r:id="rId${externalLinks.length}"/>`);
        style = STYLE.link;
      }
      const s = style ? ` s="${style}"` : "";

      if (typeof value === "number") {
        return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : "";
      }
      if (text === "") return "";
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(
        text.slice(0, MAX_CELL_TEXT),
      )}</t></is></c>`;
    });
    return `<row r="${rowNumber}">${out.join("")}</row>`;
  };

  const rows = [
    rowXml(sheet.headers, 1, true),
    ...sheet.rows.map((r, i) => rowXml(r, i + 2, false)),
  ];
  const lastCell = `${columnName(Math.max(width, 1) - 1)}${sheet.rows.length + 1}`;
  const cols = widths
    .map(
      (w, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${Math.min(Math.max(w, 8) + 2, MAX_WIDTH)}" customWidth="1"/>`,
    )
    .join("");

  const xml =
    XML_HEAD +
    `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${rows.join("")}</sheetData>` +
    (sheet.headers.length > 0 ? `<autoFilter ref="A1:${lastCell}"/>` : "") +
    (links.length > 0 ? `<hyperlinks>${links.join("")}</hyperlinks>` : "") +
    `</worksheet>`;
  return { xml, externalLinks };
}

/** Columns in use; a loop, as spreading a large sheet's rows into Math.max overflows the stack. */
function sheetWidth(sheet: XlsxSheet) {
  let width = sheet.headers.length;
  for (const row of sheet.rows) width = Math.max(width, row.length);
  return width;
}

function linkTarget(
  link: XlsxLink,
  nameOf: Map<string, string>,
): { location: string } | { external: string } | null {
  if ("file" in link) return { external: encodeURI(link.file) };
  if ("url" in link) return { external: link.url };
  const name = nameOf.get(link.sheet);
  if (!name) return null;
  return { location: `${quoteSheet(name)}!A${link.row + 1}` };
}

function workbook(sheets: XlsxSheet[], names: string[]) {
  const sheetXml = names
    .map((name, i) => `<sheet name="${xmlEscape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  // Excel expects a filter's range as this hidden name too.
  const filters = sheets
    .map((sheet, i) => {
      if (sheet.headers.length === 0) return "";
      const range = `$A$1:$${columnName(sheetWidth(sheet) - 1)}$${sheet.rows.length + 1}`;
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xmlEscape(
        `${quoteSheet(names[i])}!${range}`,
      )}</definedName>`;
    })
    .join("");
  return (
    XML_HEAD +
    `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    // The sheet views refer to this workbook view by id 0.
    `<bookViews><workbookView/></bookViews>` +
    `<sheets>${sheetXml}</sheets>` +
    (filters ? `<definedNames>${filters}</definedNames>` : "") +
    `</workbook>`
  );
}

function contentTypes(sheetCount: number) {
  const sheets = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return (
    XML_HEAD +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    sheets +
    `</Types>`
  );
}

function rels(items: { type: string; target: string; external?: boolean }[]) {
  const body = items
    .map(
      (r, i) =>
        `<Relationship Id="rId${i + 1}" Type="${r.type}" Target="${xmlEscape(r.target)}"${
          r.external ? ' TargetMode="External"' : ""
        }/>`,
    )
    .join("");
  return `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">${body}</Relationships>`;
}

// Fonts: default, bold, link. Cell styles: default, header, money, link.
const STYLES =
  XML_HEAD +
  `<styleSheet xmlns="${NS_MAIN}">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>` +
  `<fonts count="3">` +
  `<font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
  `<font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/></font>` +
  `</fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="4">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

/** Excel's sheet name rules: no `[]:*?/\`, at most 31 characters, unique ignoring case. */
export function sheetNames(wanted: string[]): string[] {
  const used = new Set<string>();
  return wanted.map((raw) => {
    const base = raw.replace(/[[\]:*?/\\]/g, " ").replace(/^'+|'+$/g, "").trim() || "Sheet";
    let name = base.slice(0, 31);
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      const suffix = ` (${n})`;
      name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

function quoteSheet(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

/** A, B, …, Z, AA, AB, … for a 0-based column. */
export function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/** Escape for XML text and attributes, dropping characters XML 1.0 can't hold. */
function xmlEscape(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
