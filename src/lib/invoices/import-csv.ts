import { poundsToPence } from "@/lib/money";

export type InvoiceImportStatus = "draft" | "sent" | "paid";

export type ParsedInvoiceImportRow = {
  rowNumber: number;
  clientEmail: string | null;
  clientName: string | null;
  clientCompany: string | null;
  issueDate: string;
  dueDate: string | null;
  number: string | null;
  description: string;
  netPence: number;
  vatPence: number;
  grossPence: number;
  status: InvoiceImportStatus;
  amountPaidPence: number;
  paidAt: string | null;
  paymentReference: string | null;
  errors: string[];
};

export type InvoiceImportContext = {
  /** Current FY start YYYY-MM-DD */
  fyStart: string;
  vatRegistered: boolean;
  /** Existing invoice numbers for this company (lowercase). */
  existingNumbers: ReadonlySet<string>;
  paymentTermsDays: number;
};

const HEADER_ALIASES: Record<string, string> = {
  client_email: "client_email",
  email: "client_email",
  client_name: "client_name",
  name: "client_name",
  contact: "client_name",
  client_company: "client_company",
  company: "client_company",
  company_name: "client_company",
  issue_date: "issue_date",
  date: "issue_date",
  due_date: "due_date",
  number: "number",
  invoice_number: "number",
  description: "description",
  desc: "description",
  net_gbp: "net_gbp",
  net: "net_gbp",
  amount_gbp: "net_gbp",
  amount: "net_gbp",
  vat_gbp: "vat_gbp",
  vat: "vat_gbp",
  gross_gbp: "gross_gbp",
  gross: "gross_gbp",
  status: "status",
  amount_paid_gbp: "amount_paid_gbp",
  amount_paid: "amount_paid_gbp",
  paid: "amount_paid_gbp",
  paid_at: "paid_at",
  payment_reference: "payment_reference",
  reference: "payment_reference",
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function mapHeader(raw: string): string | null {
  return HEADER_ALIASES[normalizeHeader(raw)] ?? null;
}

function parseDate(value: string): string | null {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(v);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${mm}-${dd}`;
  }
  return null;
}

function tryPounds(raw: string): number | null {
  if (!raw.trim()) return null;
  try {
    return poundsToPence(raw);
  } catch {
    return null;
  }
}

function parseStatus(raw: string): InvoiceImportStatus | "void" | null {
  const v = raw.trim().toLowerCase();
  if (!v) return "sent";
  if (v === "draft") return "draft";
  if (v === "sent" || v === "unpaid" || v === "open" || v === "overdue") {
    return "sent";
  }
  if (v === "paid") return "paid";
  if (v === "void") return "void";
  return null;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const INVOICE_IMPORT_TEMPLATE_CSV = `client_email,client_name,client_company,issue_date,due_date,number,description,net_gbp,vat_gbp,status,amount_paid_gbp,paid_at,payment_reference
jane@acme.example,Jane Smith,Acme Ltd,2026-04-15,2026-04-29,DD-2026-0001,April retainer,1000.00,200.00,sent,,
bob@studio.example,Bob Lee,Studio Co,2026-05-01,2026-05-15,,Website redesign,2500.00,500.00,paid,3000.00,2026-05-10,BANK-1
`;

/**
 * Pure parse + validation for invoice CSV rows.
 */
export function parseInvoiceImportCsv(
  csvText: string,
  ctx: InvoiceImportContext,
): ParsedInvoiceImportRow[] {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const rawHeaders = parseCsvLine(lines[0]);
  const colIndex = new Map<string, number>();
  for (let i = 0; i < rawHeaders.length; i++) {
    const mapped = mapHeader(rawHeaders[i]);
    if (mapped && !colIndex.has(mapped)) colIndex.set(mapped, i);
  }

  const seenNumbers = new Set<string>();
  const rows: ParsedInvoiceImportRow[] = [];

  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const cols = parseCsvLine(lines[lineIdx]);
    const get = (key: string) => {
      const idx = colIndex.get(key);
      return idx == null ? "" : (cols[idx] ?? "").trim();
    };

    const errors: string[] = [];
    const clientEmailRaw = get("client_email");
    const clientName = get("client_name") || null;
    const clientCompany = get("client_company") || null;
    const clientEmail = clientEmailRaw
      ? clientEmailRaw.toLowerCase()
      : null;
    if (clientEmailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmailRaw)) {
      errors.push(`Invalid client_email: ${clientEmailRaw}`);
    }
    if (!clientEmail && !clientName) {
      errors.push("Need client_email or client_name");
    }

    const issueDate = parseDate(get("issue_date"));
    if (!issueDate) errors.push("Invalid or missing issue_date");

    let dueDate = parseDate(get("due_date"));
    if (!dueDate && issueDate) {
      dueDate = addDaysIso(issueDate, ctx.paymentTermsDays);
    }

    const numberRaw = get("number");
    const number = numberRaw || null;
    if (number) {
      const key = number.toLowerCase();
      if (seenNumbers.has(key) || ctx.existingNumbers.has(key)) {
        errors.push(`Duplicate invoice number: ${number}`);
      } else {
        seenNumbers.add(key);
      }
    }

    const description = get("description");
    if (!description) errors.push("Missing description");

    const netPence = tryPounds(get("net_gbp"));
    if (netPence == null) errors.push("Invalid or missing net_gbp");
    else if (netPence < 0) errors.push("net_gbp cannot be negative");

    let vatPence = tryPounds(get("vat_gbp")) ?? 0;
    if (get("vat_gbp") && tryPounds(get("vat_gbp")) == null) {
      errors.push("Invalid vat_gbp");
    }
    if (!ctx.vatRegistered) vatPence = 0;

    const grossRaw = get("gross_gbp");
    let grossPence =
      netPence != null ? netPence + vatPence : 0;
    if (grossRaw) {
      const g = tryPounds(grossRaw);
      if (g == null) errors.push("Invalid gross_gbp");
      else if (netPence != null && g !== netPence + vatPence) {
        errors.push("gross_gbp must equal net_gbp + vat_gbp");
      } else {
        grossPence = g;
      }
    }

    const statusParsed = parseStatus(get("status"));
    if (statusParsed === null) {
      errors.push(`Invalid status: ${get("status")}`);
    } else if (statusParsed === "void") {
      errors.push("Cannot import void invoices");
    }

    let amountPaidPence = tryPounds(get("amount_paid_gbp")) ?? 0;
    if (get("amount_paid_gbp") && tryPounds(get("amount_paid_gbp")) == null) {
      errors.push("Invalid amount_paid_gbp");
    }
    if (amountPaidPence < 0) errors.push("amount_paid_gbp cannot be negative");

    let status: InvoiceImportStatus =
      statusParsed && statusParsed !== "void" ? statusParsed : "sent";
    if (status === "paid" && amountPaidPence === 0 && grossPence > 0) {
      amountPaidPence = grossPence;
    }
    if (amountPaidPence >= grossPence && grossPence > 0) {
      status = "paid";
    } else if (status === "paid" && amountPaidPence < grossPence) {
      status = "sent";
    }

    const fullyPaid = status === "paid" || amountPaidPence >= grossPence;
    if (
      fullyPaid &&
      issueDate &&
      issueDate < ctx.fyStart &&
      errors.length === 0
    ) {
      errors.push(
        `Fully paid invoice before financial year start (${ctx.fyStart}) — leave in your archive`,
      );
    }

    const paidAtRaw = get("paid_at");
    const paidAt = paidAtRaw ? parseDate(paidAtRaw) : null;
    if (paidAtRaw && !paidAt) errors.push("Invalid paid_at");

    const paymentReference = get("payment_reference") || null;

    rows.push({
      rowNumber: lineIdx + 1,
      clientEmail,
      clientName,
      clientCompany,
      issueDate: issueDate ?? "",
      dueDate,
      number,
      description,
      netPence: netPence ?? 0,
      vatPence,
      grossPence,
      status,
      amountPaidPence,
      paidAt,
      paymentReference,
      errors,
    });
  }

  return rows;
}

export function invoiceImportHasErrors(rows: ParsedInvoiceImportRow[]): boolean {
  return rows.some((r) => r.errors.length > 0);
}

export function parseInvoiceImportCsvFile(formData: FormData):
  | { ok: true; data: { file: File } }
  | { ok: false; error: string; fieldErrors: Record<string, string> } {
  const file = formData.get("csv");
  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      error: "Choose a CSV file",
      fieldErrors: { csv: "Choose a CSV file" },
    };
  }
  if (file.size > 2 * 1024 * 1024) {
    return {
      ok: false,
      error: "CSV must be under 2 MB",
      fieldErrors: { csv: "CSV must be under 2 MB" },
    };
  }
  return { ok: true, data: { file } };
}

/**
 * After importing historical numbers like PREFIX-YYYY-NNNN, compute the next
 * sequence so allocateInvoiceNumber does not collide.
 */
export function bumpInvoiceSeqAfterImport(
  state: {
    invoiceNumberPrefix: string;
    invoiceNextSeq: number;
    invoiceSeqYear: number | null;
  },
  importedNumbers: string[],
  currentYear: number,
): { invoiceNextSeq: number; invoiceSeqYear: number | null } {
  const prefix = (state.invoiceNumberPrefix || "DD").toLowerCase();
  const re = new RegExp(
    `^${escapeRegExp(prefix)}-(\\d{4})-(\\d+)$`,
    "i",
  );
  let nextSeq = state.invoiceNextSeq;
  let seqYear = state.invoiceSeqYear;

  for (const num of importedNumbers) {
    const m = re.exec(num.trim());
    if (!m) continue;
    const year = Number(m[1]);
    const seq = Number(m[2]);
    if (year !== currentYear || !Number.isFinite(seq)) continue;
    if (seqYear !== currentYear) {
      seqYear = currentYear;
      nextSeq = 1;
    }
    if (seq + 1 > nextSeq) nextSeq = seq + 1;
  }

  return { invoiceNextSeq: nextSeq, invoiceSeqYear: seqYear };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
