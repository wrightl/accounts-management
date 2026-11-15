import { formatIsoDateUk } from "@/lib/dates";
import type { XlsxCell, XlsxSheet } from "@/lib/xlsx/write";

/**
 * One cell of the pack, before it becomes Excel or CSV. Money is held in pence
 * and dates as YYYY-MM-DD, so both formats are written from the same values.
 */
export type PackCell =
  | null
  | string
  | {
      v: string | number | null;
      kind?: "money" | "date" | "number";
      bold?: boolean;
      heading?: boolean;
      /** Excel formula without "=", written by the pack, never from a record. `v` is its result. */
      formula?: string;
      /** A file in the zip this cell opens. */
      file?: string;
    };

export type PackSheet = {
  name: string;
  /** One line on what the tab holds, for the cover's contents list. */
  about: string;
  /** Free-form rows rather than one table under a header row. */
  layout: boolean;
  headers: string[];
  rows: PackCell[][];
  totals?: PackCell[];
  freezeRows?: number;
  /** Layout sheets only: fixed column widths, in characters, with text wrapped inside them. */
  columnWidths?: number[];
};

export type Column = {
  key: string;
  header: string;
  /** Add this column up in the totals row. */
  total?: boolean;
  /** Keep the column even when every row is empty or zero (a summary formula reads it). */
  keep?: boolean;
};

export type Row = Record<string, PackCell | undefined>;

type Extra = { bold?: boolean; formula?: string };

export const money = (pence: number | null | undefined, extra: Extra = {}): PackCell =>
  pence == null ? null : { v: pence, kind: "money", ...extra };
export const day = (iso: string | null | undefined): PackCell =>
  iso ? { v: iso, kind: "date" } : null;
export const number = (value: number | null | undefined, extra: Extra = {}): PackCell =>
  value == null ? null : { v: value, kind: "number", ...extra };
export const bold = (text: string): PackCell => ({ v: text, bold: true });
export const heading = (text: string): PackCell => ({ v: text, heading: true });

function valueOf(cell: PackCell | undefined): string | number | null {
  if (cell == null) return null;
  return typeof cell === "string" ? cell : cell.v;
}

/** Nothing to show: blank, or a zero amount. */
function isBlank(cell: PackCell | undefined): boolean {
  const value = valueOf(cell);
  return value == null || value === "" || value === 0;
}

/** A, B, …, Z, AA for a 0-based column. */
export function columnLetter(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

export function quoteSheet(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

/** Columns worth showing: those some row has a value in, and any marked `keep`. */
function shownColumns(columns: Column[], rows: Row[]): Column[] {
  return columns.filter((c) => c.keep || rows.some((r) => !isBlank(r[c.key])));
}

function columnTotal(rows: Row[], key: string): number {
  return rows.reduce((total, r) => {
    const value = valueOf(r[key]);
    return total + (typeof value === "number" ? value : 0);
  }, 0);
}

function totalCell(rows: Row[], column: Column, range: string): PackCell {
  const sample = rows.map((r) => r[column.key]).find((c) => c != null && typeof c !== "string");
  const kind = sample && typeof sample !== "string" && sample.kind === "number" ? "number" : "money";
  return { v: columnTotal(rows, column.key), kind, bold: true, formula: `SUM(${range})` };
}

export type DetailTab = {
  name: string;
  /** Null when there are no rows: the tab is left out of the workbook. */
  sheet: PackSheet | null;
  /** The column's cells as an absolute reference from another sheet, or null when it isn't shown. */
  range: (key: string) => string | null;
  /** Sum of a column's cells, in pence for money. */
  total: (key: string) => number;
  /** Sum of a column over the rows where another column holds `value`. */
  totalWhere: (key: string, whereKey: string, value: string) => number;
};

/**
 * A detail tab: one table under a frozen header row, without columns that are
 * empty for every row, and with a totals row.
 */
export function detailTab(name: string, about: string, columns: Column[], rows: Row[]): DetailTab {
  const shown = shownColumns(columns, rows);
  const last = rows.length + 1;
  const letter = (key: string) => {
    const index = shown.findIndex((c) => c.key === key);
    return index < 0 ? null : columnLetter(index);
  };
  const totals: PackCell[] | undefined = shown.some((c) => c.total)
    ? shown.map((c, i) =>
        c.total
          ? totalCell(rows, c, `${columnLetter(i)}2:${columnLetter(i)}${last}`)
          : i === 0
            ? bold("Total")
            : null,
      )
    : undefined;
  return {
    name,
    sheet:
      rows.length === 0
        ? null
        : {
            name,
            about,
            layout: false,
            headers: shown.map((c) => c.header),
            rows: rows.map((r) => shown.map((c) => r[c.key] ?? null)),
            totals,
          },
    range: (key) => {
      const col = letter(key);
      return col && rows.length > 0 ? `${quoteSheet(name)}!$${col}$2:$${col}$${last}` : null;
    },
    total: (key) => columnTotal(rows, key),
    totalWhere: (key, whereKey, value) =>
      columnTotal(
        rows.filter(
          (r) => String(valueOf(r[whereKey]) ?? "").toLowerCase() === value.toLowerCase(),
        ),
        key,
      ),
  };
}

/** Rows of a free-form sheet, built top to bottom. */
export class Layout {
  readonly rows: PackCell[][] = [];

  /** Append a row and return its row number in the sheet. */
  add(...cells: PackCell[]): number {
    this.rows.push(cells);
    return this.rows.length;
  }

  gap(): void {
    if (this.rows.length > 0 && this.rows.at(-1)!.length > 0) this.rows.push([]);
  }

  /**
   * A table within the sheet: a bold header row, the rows without their empty
   * columns, and a totals row. Returns where it landed, for formulas.
   */
  table(columns: Column[], rows: Row[], options: { totalLabel?: string } = {}) {
    const shown = shownColumns(columns, rows);
    this.add(...shown.map((c) => bold(c.header)));
    const first = this.rows.length + 1;
    for (const r of rows) this.add(...shown.map((c) => r[c.key] ?? null));
    const last = this.rows.length;
    let totalRow: number | null = null;
    if (rows.length > 0 && shown.some((c) => c.total)) {
      totalRow = this.add(
        ...shown.map((c, i) =>
          c.total
            ? totalCell(rows, c, `${columnLetter(i)}${first}:${columnLetter(i)}${last}`)
            : i === 0
              ? bold(options.totalLabel ?? "Total")
              : null,
        ),
      );
    }
    return {
      first,
      last,
      totalRow,
      letter: (key: string) => {
        const index = shown.findIndex((c) => c.key === key);
        return index < 0 ? null : columnLetter(index);
      },
    };
  }

  sheet(
    name: string,
    about: string,
    options: { freezeRows?: number; columnWidths?: number[] } = {},
  ): PackSheet {
    return { name, about, layout: true, headers: [], rows: this.rows, ...options };
  }
}

function toXlsxCell(cell: PackCell): XlsxCell {
  if (cell == null) return "";
  if (typeof cell === "string") return cell;
  const { v, kind, bold: isBold, heading: isHeading, formula, file } = cell;
  if (v == null) return "";
  const link = file ? { file } : undefined;
  if (kind === "money" && typeof v === "number") {
    return { value: v / 100, money: true, bold: isBold, formula, link };
  }
  if (kind === "date" && typeof v === "string") return { value: v, date: true, bold: isBold, link };
  return { value: v, bold: isBold, heading: isHeading, formula, link };
}

export function toXlsxSheets(sheets: PackSheet[]): XlsxSheet[] {
  return sheets.map((s) => ({
    name: s.name,
    headers: s.headers,
    rows: s.rows.map((r) => r.map(toXlsxCell)),
    layout: s.layout,
    totals: s.totals?.map(toXlsxCell),
    freezeRows: s.freezeRows,
    columnWidths: s.columnWidths,
  }));
}

/** A cell as CSV text: money with two decimals, dates as dd/mm/yyyy, formulas as their results. */
export function cellText(cell: PackCell): string {
  if (cell == null) return "";
  if (typeof cell === "string") return cell;
  if (cell.v == null) return "";
  if (cell.kind === "money" && typeof cell.v === "number") return (cell.v / 100).toFixed(2);
  if (cell.kind === "date" && typeof cell.v === "string") return formatIsoDateUk(cell.v) ?? cell.v;
  return String(cell.v);
}

/** Every row of a sheet as text, header and totals included. */
export function sheetTextRows(sheet: PackSheet): string[][] {
  return [
    ...(sheet.layout ? [] : [sheet.headers]),
    ...sheet.rows.map((r) => r.map(cellText)),
    ...(sheet.totals ? [sheet.totals.map(cellText)] : []),
  ];
}
