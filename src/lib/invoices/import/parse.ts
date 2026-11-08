import { parseCsv } from "@/lib/csv/parse";
import type {
  ColumnMapping,
  ImportDateFormat,
  ImportField,
} from "@/lib/invoices/import/fields";
import { invoiceTotals, lineNetPence, poundsToPence } from "@/lib/money";

export const MAX_IMPORT_ROWS = 20_000;
export const MAX_IMPORT_INVOICES = 5_000;

export interface ParsedLine {
  description: string;
  quantity: number;
  unitPricePence: number;
  vatRate: number;
  discountPercent: number;
}

export interface ParsedClient {
  key: string;
  name: string | null;
  companyName: string | null;
  email: string | null;
  address: string | null;
}

export interface ParsedInvoice {
  /** As written in the source, trimmed. Null when the source had none. */
  number: string | null;
  client: ParsedClient;
  issueDate: string;
  dueDate: string | null;
  status: "sent" | "paid";
  netPence: number;
  vatPence: number;
  grossPence: number;
  amountPaidPence: number;
  paidDate: string | null;
  paymentReference: string | null;
  lines: ParsedLine[];
  sourceRows: number[];
}

export interface ParsedDraft {
  invoice: ParsedInvoice;
  errors: string[];
  warnings: string[];
}

export interface SkippedRows {
  rows: number[];
  number: string | null;
  reason: string;
}

export interface ParsedImport {
  headers: string[];
  rowCount: number;
  drafts: ParsedDraft[];
  skipped: SkippedRows[];
}

/** YYYY-MM-DD for a real calendar date, else null. */
function isoIfReal(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Accepts ISO, the chosen numeric order, and "15 Jan 2026". Spreadsheet serial numbers aren't dates here. */
export function parseImportDate(raw: string, format: ImportDateFormat): string | null {
  const v = raw.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(v);
  if (iso) return isoIfReal(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const named = /^(\d{1,2})[\s-]([a-z]{3})[a-z]*[\s-](\d{4})$/i.exec(v);
  if (named) {
    const month = MONTHS.indexOf(named[2].toLowerCase()) + 1;
    return month ? isoIfReal(Number(named[3]), month, Number(named[1])) : null;
  }
  const numeric = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(v);
  if (!numeric) return null;
  const first = Number(numeric[1]);
  const second = Number(numeric[2]);
  const year = numeric[3].length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
  return format === "dmy"
    ? isoIfReal(year, second, first)
    : isoIfReal(year, first, second);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Pence, null when blank, "invalid" when it can't be read. Handles (1.00) as negative. */
function money(raw: string): number | null | "invalid" {
  let v = raw.trim();
  if (!v) return null;
  const negative = /^\(.*\)$/.test(v);
  if (negative) v = v.slice(1, -1);
  try {
    const pence = poundsToPence(v.replace(/[$€]/g, ""));
    return negative ? -pence : pence;
  } catch {
    return "invalid";
  }
}

function plainNumber(raw: string): number | null | "invalid" {
  const v = raw.trim().replace(/%$/, "");
  if (!v) return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : "invalid";
}

export function normalizeClientKey(
  email: string | null,
  name: string | null,
  companyName: string | null,
): string {
  if (email) return `email:${email.toLowerCase()}`;
  return `name:${(companyName || name || "").trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/** VAT rate for a line: a standard rate if it explains the VAT, else the nearest whole number. */
function deriveVatRate(
  netPence: number,
  vatPence: number,
): { rate: number; exact: boolean } {
  if (netPence === 0) return { rate: 0, exact: vatPence === 0 };
  for (const rate of [0, 5, 20]) {
    if (Math.abs(Math.round((netPence * rate) / 100) - vatPence) <= 1) {
      return { rate, exact: true };
    }
  }
  return { rate: Math.round((vatPence / netPence) * 100), exact: false };
}

const SKIP_STATUSES = new Map([
  ["draft", "Draft: never issued"],
  ["void", "Void: nothing owed"],
  ["voided", "Void: nothing owed"],
  ["deleted", "Deleted in the source"],
  ["cancelled", "Cancelled in the source"],
  ["canceled", "Cancelled in the source"],
]);
const OPEN_STATUSES = new Set([
  "",
  "sent",
  "unpaid",
  "open",
  "overdue",
  "authorised",
  "authorized",
  "awaiting payment",
  "part paid",
  "partially paid",
  "submitted",
  "issued",
]);

type Row = {
  number: number;
  get: (field: ImportField) => string;
};

function buildDraft(
  rows: Row[],
  options: { dateFormat: ImportDateFormat; paymentTermsDays: number },
): ParsedDraft {
  const errors: string[] = [];
  const warnings: string[] = [];
  const first = rows[0];
  const get = first.get;
  const read = (field: ImportField, label: string) => {
    const value = money(get(field));
    if (value === "invalid") {
      errors.push(`${label} isn't an amount: ${get(field)}`);
      return null;
    }
    return value;
  };
  const date = (field: ImportField, label: string) => {
    const raw = get(field);
    if (!raw.trim()) return null;
    const parsed = parseImportDate(raw, options.dateFormat);
    if (!parsed) errors.push(`${label} isn't a real date in the chosen format: ${raw}`);
    return parsed;
  };

  const email = get("clientEmail").trim().toLowerCase() || null;
  const name = get("clientName").trim() || null;
  const companyName = get("clientCompany").trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push(`Client email isn't valid: ${email}`);
  }
  if (!email && !name && !companyName) errors.push("Needs a client name or email");
  const client: ParsedClient = {
    key: normalizeClientKey(email, name, companyName),
    name,
    companyName,
    email,
    address: get("clientAddress").trim() || null,
  };

  for (const row of rows.slice(1)) {
    for (const [field, label] of [
      ["issueDate", "issue date"],
      ["clientName", "client"],
      ["clientEmail", "client email"],
      ["status", "status"],
    ] as const) {
      if (row.get(field).trim() !== get(field).trim()) {
        errors.push(`Rows for this invoice disagree on ${label} (row ${row.number})`);
      }
    }
  }

  const issueDate = date("issueDate", "Issue date");
  if (!get("issueDate").trim()) errors.push("Missing issue date");
  const dueRaw = date("dueDate", "Due date");
  const dueDate =
    dueRaw ?? (issueDate ? addDaysIso(issueDate, options.paymentTermsDays) : null);
  const paidDate = date("paidDate", "Paid date");

  const headerNet = read("net", "Net total");
  const headerVat = read("vat", "VAT total");
  const headerGross = read("gross", "Gross total");

  const lineNets: number[] = [];
  const lineVats: number[] = [];
  const lines: ParsedLine[] = [];
  let unsureRate = false;
  rows.forEach((row) => {
    const amount = (field: ImportField, label: string) => {
      const value = money(row.get(field));
      if (value === "invalid") {
        errors.push(`${label} isn't an amount on row ${row.number}: ${row.get(field)}`);
        return null;
      }
      return value;
    };
    const num = (field: ImportField, label: string) => {
      const value = plainNumber(row.get(field));
      if (value === "invalid") {
        errors.push(`${label} isn't a number on row ${row.number}: ${row.get(field)}`);
        return null;
      }
      return value;
    };
    const quantity = num("quantity", "Quantity") ?? 1;
    const unitPrice = amount("unitPrice", "Unit price");
    const discount = num("discount", "Discount") ?? 0;
    const explicitNet = amount("lineNet", "Line net");
    const explicitVat = amount("lineVat", "Line VAT");
    const explicitRate = num("vatRate", "VAT rate");

    const shaped = { quantity, unitPricePence: unitPrice ?? 0, discountPercent: discount };
    let net =
      explicitNet ??
      (unitPrice != null
        ? lineNetPence(shaped)
        : rows.length === 1
          ? (headerNet ??
            (headerGross != null ? headerGross - (headerVat ?? 0) : null))
          : null);
    if (net == null) {
      errors.push(`Row ${row.number} has no amount to read`);
      net = 0;
    }

    const vat =
      explicitVat ??
      (explicitRate != null
        ? Math.round((net * explicitRate) / 100)
        : rows.length === 1
          ? (headerVat ?? 0)
          : 0);
    const derived = deriveVatRate(net, vat);
    const rate = explicitRate != null && Number.isInteger(explicitRate) ? explicitRate : derived.rate;
    if (explicitRate != null ? !Number.isInteger(explicitRate) : !derived.exact) unsureRate = true;

    const description = row.get("description").trim();
    const keepShape = unitPrice != null && Math.abs(lineNetPence(shaped) - net) <= 1;
    lines.push({
      description:
        (description || "Imported invoice") +
        (!keepShape && discount > 0 ? " (after discount)" : ""),
      quantity: keepShape ? quantity : 1,
      unitPricePence: keepShape ? (unitPrice as number) : net,
      vatRate: rate,
      discountPercent: keepShape ? discount : 0,
    });
    lineNets.push(net);
    lineVats.push(vat);
  });
  if (unsureRate) {
    warnings.push("A VAT rate is approximate on the lines; the invoice's VAT total is kept as given");
  }

  const lineNetTotal = lineNets.reduce((a, b) => a + b, 0);
  const lineVatTotal = lineVats.reduce((a, b) => a + b, 0);
  const anyLineAmounts = rows.some(
    (r) => r.get("unitPrice").trim() || r.get("lineNet").trim(),
  );
  const vatPence =
    headerVat ??
    (headerGross != null && headerNet != null ? headerGross - headerNet : lineVatTotal);
  const netPence =
    headerNet ?? (headerGross != null && !anyLineAmounts ? headerGross - vatPence : lineNetTotal);
  const grossPence = headerGross ?? netPence + vatPence;

  if (netPence + vatPence !== grossPence) {
    errors.push("Gross total doesn't equal net plus VAT");
  }
  if (anyLineAmounts && Math.abs(lineNetTotal - netPence) > rows.length) {
    errors.push("The lines don't add up to the invoice's net total");
  }
  if (vatPence < 0) errors.push("VAT can't be negative");
  if (grossPence < 0) {
    errors.push("A negative total looks like a credit note, which this import doesn't bring in");
  }
  if (invoiceTotals(lines).vatPence !== vatPence && errors.length === 0 && !unsureRate) {
    warnings.push("Line VAT doesn't add up exactly to the invoice's VAT total; the total is kept as given");
  }

  const statusRaw = get("status").trim().toLowerCase();
  const paidExplicit = read("amountPaid", "Amount paid");
  const due = read("amountDue", "Amount due");
  let amountPaidPence = paidExplicit ?? (due != null ? grossPence - due : 0);
  if (amountPaidPence < 0) errors.push("Amount paid can't be negative");
  if (amountPaidPence > grossPence) {
    errors.push("Amount paid is more than the invoice total");
  }
  let status: "sent" | "paid" = "sent";
  if (statusRaw === "paid") {
    status = "paid";
    if (paidExplicit == null && due == null) amountPaidPence = grossPence;
    else if (amountPaidPence < grossPence) {
      status = "sent";
      warnings.push("Marked paid but the amounts show part still owed, so it stays open");
    }
  } else if (OPEN_STATUSES.has(statusRaw)) {
    if (grossPence > 0 && amountPaidPence >= grossPence) status = "paid";
  } else {
    errors.push(`Unknown status: ${get("status")}`);
  }

  if (amountPaidPence > 0 && !paidDate) {
    warnings.push("No paid date, so the payment is dated the same as the invoice");
  }
  if (issueDate && dueRaw && dueRaw < issueDate) warnings.push("Due date is before the issue date");
  if (issueDate && paidDate && paidDate < issueDate) warnings.push("Paid date is before the issue date");
  const number = get("number").trim() || null;
  if (!number) warnings.push("No invoice number, so one will be created starting IMP-");

  return {
    invoice: {
      number,
      client,
      issueDate: issueDate ?? "",
      dueDate,
      status,
      netPence,
      vatPence,
      grossPence,
      amountPaidPence,
      paidDate,
      paymentReference: get("paymentReference").trim() || null,
      lines,
      sourceRows: rows.map((r) => r.number),
    },
    errors: [...new Set(errors)],
    warnings,
  };
}

/** Checks for an invoice that was read from a PDF or edited by hand. */
export function validateParsedInvoice(invoice: ParsedInvoice): string[] {
  const errors: string[] = [];
  const amounts = [invoice.netPence, invoice.vatPence, invoice.grossPence, invoice.amountPaidPence];
  if (amounts.some((a) => !Number.isFinite(a))) errors.push("An amount isn't a number");
  if (!invoice.client.name && !invoice.client.companyName && !invoice.client.email) {
    errors.push("Needs a client name or email");
  }
  if (invoice.client.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoice.client.email)) {
    errors.push(`Client email isn't valid: ${invoice.client.email}`);
  }
  if (!parseImportDate(invoice.issueDate, "dmy")) errors.push("Needs an issue date");
  for (const [value, label] of [
    [invoice.dueDate, "Due date"],
    [invoice.paidDate, "Paid date"],
  ] as const) {
    if (value && !parseImportDate(value, "dmy")) errors.push(`${label} isn't a real date`);
  }
  if (invoice.paidDate && invoice.amountPaidPence === 0) {
    errors.push("There's a paid date but no amount paid");
  }
  if (invoice.status === "paid" && invoice.amountPaidPence < invoice.grossPence) {
    errors.push("Marked paid, but the amount paid is less than the total");
  }
  if (invoice.netPence + invoice.vatPence !== invoice.grossPence) {
    errors.push("Gross total doesn't equal net plus VAT");
  }
  if (invoice.vatPence < 0) errors.push("VAT can't be negative");
  if (invoice.grossPence < 0) {
    errors.push("A negative total looks like a credit note, which this import doesn't bring in");
  }
  if (invoice.amountPaidPence < 0) errors.push("Amount paid can't be negative");
  if (invoice.amountPaidPence > invoice.grossPence) {
    errors.push("Amount paid is more than the invoice total");
  }
  if (invoice.lines.length === 0) errors.push("Needs at least one line");
  const lineTotal = invoice.lines.reduce((acc, line) => acc + lineNetPence(line), 0);
  if (Math.abs(lineTotal - invoice.netPence) > invoice.lines.length) {
    errors.push("The lines don't add up to the invoice's net total");
  }
  return errors;
}

export const UNREGISTERED_VAT_LINE = "VAT shown on the original invoice (not VAT registered)";

/**
 * An invoice as a company that isn't VAT registered records it: no VAT, so the whole
 * total is income. Any VAT the source showed becomes its own line, keeping the lines
 * adding up to the net total and leaving the change visible.
 */
export function withoutVat(invoice: ParsedInvoice): ParsedInvoice {
  if (invoice.vatPence === 0 && invoice.lines.every((l) => l.vatRate === 0)) return invoice;
  const lines = invoice.lines.map((l) => ({ ...l, vatRate: 0 }));
  if (invoice.vatPence !== 0) {
    lines.push({
      description: UNREGISTERED_VAT_LINE,
      quantity: 1,
      unitPricePence: invoice.vatPence,
      vatRate: 0,
      discountPercent: 0,
    });
  }
  return { ...invoice, netPence: invoice.grossPence, vatPence: 0, lines };
}

/** Pure parse, grouping and per-invoice validation. Rows with the same number form one invoice. */
export function parseInvoiceImport(
  csvText: string,
  mapping: ColumnMapping,
  options: { dateFormat: ImportDateFormat; paymentTermsDays: number },
): ParsedImport {
  const table = parseCsv(csvText);
  const headers = (table[0] ?? []).map((h) => h.trim());
  const indexes = new Map(
    Object.entries(mapping).map(([field, header]) => [
      field,
      headers.indexOf((header ?? "").trim()),
    ]),
  );

  const groups = new Map<string, Row[]>();
  table.slice(1).forEach((cols, i) => {
    const row: Row = {
      number: i + 2,
      get: (field) => {
        const index = indexes.get(field) ?? -1;
        return index < 0 ? "" : (cols[index] ?? "");
      },
    };
    const number = row.get("number").trim().toLowerCase();
    const key = number ? `n:${number}` : `r:${row.number}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });

  const drafts: ParsedDraft[] = [];
  const skipped: SkippedRows[] = [];
  for (const rows of groups.values()) {
    const first = rows[0];
    const number = first.get("number").trim() || null;
    const sourceRows = rows.map((r) => r.number);
    const status = first.get("status").trim().toLowerCase();
    const skipReason = SKIP_STATUSES.get(status);
    if (skipReason) {
      skipped.push({ rows: sourceRows, number, reason: skipReason });
      continue;
    }
    const currency = first.get("currency").trim().toUpperCase();
    if (currency && currency !== "GBP") {
      skipped.push({
        rows: sourceRows,
        number,
        reason: `In ${currency}: Alfa only holds invoices in GBP`,
      });
      continue;
    }
    drafts.push(buildDraft(rows, options));
  }

  return { headers, rowCount: table.length - 1, drafts, skipped };
}
