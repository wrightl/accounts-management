import { EXPENSE_CATEGORIES, isExpenseCategory, type ExpenseStatus } from "@/lib/expenses/categories";
import {
  appendMileageDescription,
  DEFAULT_MILEAGE_RATE_PENCE,
  mileageAmountPence,
} from "@/lib/expenses/mileage";
import { poundsToPence } from "@/lib/money";

export interface ExpenseImportFounder {
  id: string;
  name: string | null;
  email: string;
}

export interface ParsedExpenseImportRow {
  rowNumber: number;
  spentAt: string;
  description: string;
  amountPence: number;
  category: string | null;
  paidByUserId: string;
  status: ExpenseStatus;
  mileageMiles: number | null;
  mileageRatePence: number | null;
  errors: string[];
}

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

const HEADER_ALIASES: Record<string, string> = {
  date: "date",
  spent_at: "date",
  description: "description",
  desc: "description",
  narrative: "description",
  amount_gbp: "amount_gbp",
  amount: "amount_gbp",
  gbp: "amount_gbp",
  category: "category",
  paid_by: "paid_by",
  payee: "paid_by",
  founder: "paid_by",
  status: "status",
  miles: "miles",
  mileage: "miles",
  mileage_rate_pence: "mileage_rate_pence",
  rate_pence: "mileage_rate_pence",
};

function mapHeader(raw: string): string | null {
  const key = normalizeHeader(raw);
  return HEADER_ALIASES[key] ?? null;
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

function resolveFounder(paidBy: string, founders: ExpenseImportFounder[]): string | null {
  const needle = paidBy.trim().toLowerCase();
  if (!needle) return null;
  const byEmail = founders.find((f) => f.email.toLowerCase() === needle);
  if (byEmail) return byEmail.id;
  const byName = founders.find((f) => (f.name ?? "").toLowerCase() === needle);
  if (byName) return byName.id;
  const partial = founders.find(
    (f) =>
      f.email.toLowerCase().includes(needle) ||
      (f.name ?? "").toLowerCase().includes(needle),
  );
  return partial?.id ?? null;
}

function parseStatus(value: string): ExpenseStatus | null {
  const v = value.trim().toLowerCase();
  if (!v) return "reimbursable";
  if (v === "reimbursable" || v === "reimburse") return "reimbursable";
  if (v === "recorded") return "recorded";
  if (v === "company_paid" || v === "company paid" || v === "company") return "company_paid";
  if (v === "reimbursed") return "reimbursed";
  return null;
}

export function parseExpenseImportCsv(
  csvText: string,
  founders: ExpenseImportFounder[],
  defaultMileageRatePence = DEFAULT_MILEAGE_RATE_PENCE,
): ParsedExpenseImportRow[] {
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

  const rows: ParsedExpenseImportRow[] = [];
  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const cols = parseCsvLine(lines[lineIdx]);
    const get = (key: string) => {
      const idx = colIndex.get(key);
      return idx == null ? "" : (cols[idx] ?? "").trim();
    };

    const errors: string[] = [];
    const spentAt = parseDate(get("date"));
    if (!spentAt) errors.push("Invalid or missing date");

    const description = get("description");
    if (!description) errors.push("Missing description");

    const paidByRaw = get("paid_by");
    const paidByUserId = resolveFounder(paidByRaw, founders);
    if (!paidByUserId) errors.push(`Unknown paid_by: ${paidByRaw || "(empty)"}`);

    const statusRaw = get("status");
    const status = parseStatus(statusRaw);
    if (!status) errors.push(`Invalid status: ${statusRaw}`);
    else if (status === "reimbursed") errors.push("Cannot import already-reimbursed expenses");

    const categoryRaw = get("category");
    let category: string | null = null;
    if (categoryRaw) {
      if (isExpenseCategory(categoryRaw)) category = categoryRaw;
      else {
        const match = EXPENSE_CATEGORIES.find(
          (c) => c.toLowerCase() === categoryRaw.toLowerCase(),
        );
        if (match) category = match;
        else errors.push(`Unknown category: ${categoryRaw}`);
      }
    }

    const milesRaw = get("miles");
    const miles = milesRaw ? Number(milesRaw) : null;
    const rateRaw = get("mileage_rate_pence");
    const mileageRatePence = rateRaw ? Number(rateRaw) : defaultMileageRatePence;

    let amountPence = 0;
    let mileageMiles: number | null = null;
    let mileageRate: number | null = null;
    let finalDescription = description;

    if (miles != null && Number.isFinite(miles) && miles > 0) {
      if (!Number.isFinite(mileageRatePence) || mileageRatePence <= 0) {
        errors.push("Invalid mileage rate");
      } else {
        try {
          amountPence = mileageAmountPence(miles, mileageRatePence);
          mileageMiles = Math.round(miles);
          mileageRate = Math.round(mileageRatePence);
          finalDescription = appendMileageDescription(description, mileageMiles, mileageRate);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : "Invalid mileage");
        }
      }
    } else {
      const amountRaw = get("amount_gbp");
      if (!amountRaw) errors.push("Missing amount_gbp (or miles)");
      else {
        try {
          amountPence = poundsToPence(amountRaw);
          if (amountPence <= 0) errors.push("Amount must be positive");
        } catch {
          errors.push(`Invalid amount: ${amountRaw}`);
        }
      }
    }

    const effectiveStatus =
      status === "company_paid"
        ? "company_paid"
        : status === "recorded"
          ? "recorded"
          : "reimbursable";

    rows.push({
      rowNumber: lineIdx + 1,
      spentAt: spentAt ?? "",
      description: finalDescription,
      amountPence,
      category,
      paidByUserId: paidByUserId ?? "",
      status: effectiveStatus,
      mileageMiles,
      mileageRatePence: mileageRate,
      errors,
    });
  }

  return rows;
}

export function expenseImportHasErrors(rows: ParsedExpenseImportRow[]): boolean {
  return rows.some((r) => r.errors.length > 0);
}
