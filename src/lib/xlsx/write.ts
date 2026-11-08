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

const STYLE = { money: 1, link: 2 } as const;
const TABLE_STYLE = "TableStyleMedium2";

const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/**
 * A minimal .xlsx: each sheet holds one Excel table (banded, with a filter on
 * its frozen header row), money as numbers, and hyperlinks to other sheets'
 * rows, to files beside the workbook, or to web addresses. Text is written as inline strings, which Excel never runs as a
 * formula, so outside text like `=HYPERLINK(...)` stays text.
 */
export async function buildXlsx(sheets: XlsxSheet[]): Promise<Uint8Array> {
  const names = sheetNames(sheets.map((s) => s.name));
  const nameOf = new Map(sheets.map((s, i) => [s.name, names[i]]));

  const built = sheets.map((sheet, i) => worksheet(sheet, nameOf, i + 1));
  const tableNames = uniqueTableNames(names);

  const parts: [string, string][] = [
    ["[Content_Types].xml", contentTypes(built)],
    [
      "_rels/.rels",
      rels([{ type: `${NS_REL}/officeDocument`, target: "xl/workbook.xml" }]),
    ],
    ["xl/workbook.xml", workbook(names)],
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
  built.forEach(({ xml, externalLinks, table }, i) => {
    const n = i + 1;
    parts.push([`xl/worksheets/sheet${n}.xml`, xml]);
    const sheetRels = externalLinks.map((target) => ({
      type: `${NS_REL}/hyperlink`,
      target,
      external: true,
    }));
    if (table) {
      // The sheet's tablePart refers to this as the id after its hyperlinks.
      sheetRels.push({ type: `${NS_REL}/table`, target: `../tables/table${n}.xml`, external: false });
      parts.push([`xl/tables/table${n}.xml`, tableXml(n, tableNames[i], table)]);
    }
    if (sheetRels.length > 0) {
      parts.push([`xl/worksheets/_rels/sheet${n}.xml.rels`, rels(sheetRels)]);
    }
  });

  return zipStore(parts, "Workbook");
}

function worksheet(sheet: XlsxSheet, nameOf: Map<string, string>, sheetNumber: number) {
  const width = sheetWidth(sheet);
  // A table's header cells must be text matching its column names exactly.
  const columns = tableColumnNames(sheet.headers, width);
  const widths = columns.map((h) => h.length);
  const links: string[] = [];
  const externalLinks: string[] = [];

  const rowXml = (cells: XlsxCell[], rowNumber: number) => {
    const out = cells.map((cell, col) => {
      const ref = `${columnName(col)}${rowNumber}`;
      const { value, money, link } =
        typeof cell === "string" ? { value: cell } : cell;
      const text = String(value);
      widths[col] = Math.max(widths[col] ?? 0, text.length);

      // Header cells keep the default style, so the table style's header colours show.
      let style = money ? STYLE.money : 0;
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

  const rows = [rowXml(columns, 1), ...sheet.rows.map((r, i) => rowXml(r, i + 2))];
  const cols = widths
    .map(
      (w, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${Math.min(Math.max(w, 8) + 2, MAX_WIDTH)}" customWidth="1"/>`,
    )
    .join("");

  // A table needs a body row, so an empty one spans a blank row 2.
  const table =
    width > 0
      ? { ref: `A1:${columnName(width - 1)}${Math.max(sheet.rows.length, 1) + 1}`, columns }
      : null;

  const xml =
    XML_HEAD +
    `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${rows.join("")}</sheetData>` +
    (links.length > 0 ? `<hyperlinks>${links.join("")}</hyperlinks>` : "") +
    (table
      ? `<tableParts count="1"><tablePart r:id="rId${externalLinks.length + 1}"/></tableParts>`
      : "") +
    `</worksheet>`;
  return { xml, externalLinks, table, sheetNumber };
}

function tableXml(id: number, name: string, table: { ref: string; columns: string[] }) {
  const columns = table.columns
    .map((c, i) => `<tableColumn id="${i + 1}" name="${xmlEscape(c)}"/>`)
    .join("");
  return (
    XML_HEAD +
    `<table xmlns="${NS_MAIN}" id="${id}" name="${name}" displayName="${name}" ref="${table.ref}" totalsRowShown="0">` +
    `<autoFilter ref="${table.ref}"/>` +
    `<tableColumns count="${table.columns.length}">${columns}</tableColumns>` +
    `<tableStyleInfo name="${TABLE_STYLE}" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/>` +
    `</table>`
  );
}

/** One non-empty, unique (ignoring case) name per column, as Excel tables require. */
export function tableColumnNames(headers: string[], width: number): string[] {
  const used = new Set<string>();
  return Array.from({ length: width }, (_, i) => {
    const base = (headers[i] ?? "").replace(/[\r\n]+/g, " ").trim() || `Column ${i + 1}`;
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });
}

/**
 * Table names from sheet names: letters, digits and underscores, prefixed so
 * none can read as a cell reference like `A1` or `R1C1`.
 */
export function uniqueTableNames(sheetNames: string[]): string[] {
  const used = new Set<string>();
  return sheetNames.map((sheet) => {
    const base = `Table_${sheet.replace(/&/g, "and").replace(/[^A-Za-z0-9_]+/g, "_")}`.slice(0, 200);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base}_${n}`;
    used.add(name.toLowerCase());
    return name;
  });
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

function workbook(names: string[]) {
  const sheetXml = names
    .map((name, i) => `<sheet name="${xmlEscape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  return (
    XML_HEAD +
    `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    // The sheet views refer to this workbook view by id 0.
    `<bookViews><workbookView/></bookViews>` +
    `<sheets>${sheetXml}</sheets>` +
    `</workbook>`
  );
}

function contentTypes(sheets: { table: unknown; sheetNumber: number }[]) {
  const overrides = sheets
    .map(
      ({ table, sheetNumber: n }) =>
        `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        (table
          ? `<Override PartName="/xl/tables/table${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`
          : ""),
    )
    .join("");
  return (
    XML_HEAD +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    overrides +
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

// Fonts: default, link. Cell styles: default, money, link.
const STYLES =
  XML_HEAD +
  `<styleSheet xmlns="${NS_MAIN}">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>` +
  `<fonts count="2">` +
  `<font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/></font>` +
  `</fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="3">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
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
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
