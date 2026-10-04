export type ParsedClientImportRow = {
  rowNumber: number;
  name: string;
  companyName: string | null;
  email: string | null;
  addressLines: string | null;
  notes: string | null;
  /** Matched existing client id when previewing against DB (set at commit). */
  existingClientId?: string | null;
  action: "create" | "update" | "skip_duplicate_in_file";
  errors: string[];
};

const HEADER_ALIASES: Record<string, string> = {
  name: "name",
  contact: "name",
  contact_name: "name",
  company_name: "company_name",
  company: "company_name",
  email: "email",
  address: "address_lines",
  address_lines: "address_lines",
  notes: "notes",
  note: "notes",
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

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export const CLIENT_IMPORT_TEMPLATE_CSV = `name,company_name,email,address_lines,notes
Jane Smith,Acme Ltd,jane@acme.example,"1 High Street, London",Preferred contact
`;

/**
 * Parse a clients CSV. Dedupes within the file by email, else company+name.
 * Later duplicates are marked skip_duplicate_in_file.
 */
export function parseClientImportCsv(csvText: string): ParsedClientImportRow[] {
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

  const seenEmails = new Set<string>();
  const seenKeys = new Set<string>();
  const rows: ParsedClientImportRow[] = [];

  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const cols = parseCsvLine(lines[lineIdx]);
    const get = (key: string) => {
      const idx = colIndex.get(key);
      return idx == null ? "" : (cols[idx] ?? "").trim();
    };

    const errors: string[] = [];
    const name = get("name");
    if (!name) errors.push("Missing name");
    else if (name.length > 200) errors.push("Name is too long");

    const companyNameRaw = get("company_name");
    const companyName = companyNameRaw ? companyNameRaw.slice(0, 200) : null;

    const emailRaw = get("email");
    let email: string | null = null;
    if (emailRaw) {
      if (!isValidEmail(emailRaw)) errors.push(`Invalid email: ${emailRaw}`);
      else email = emailRaw.toLowerCase();
    }

    const addressLines = get("address_lines") || null;
    const notes = get("notes") || null;

    let action: ParsedClientImportRow["action"] = "create";
    if (email && seenEmails.has(email)) {
      action = "skip_duplicate_in_file";
      errors.push("Duplicate email earlier in this file");
    } else if (!email) {
      const key = `${(companyName ?? "").toLowerCase()}|${name.toLowerCase()}`;
      if (name && seenKeys.has(key)) {
        action = "skip_duplicate_in_file";
        errors.push("Duplicate name/company earlier in this file");
      } else if (name) {
        seenKeys.add(key);
      }
    }
    if (email && action === "create") seenEmails.add(email);

    rows.push({
      rowNumber: lineIdx + 1,
      name,
      companyName,
      email,
      addressLines,
      notes,
      action,
      errors,
    });
  }

  return rows;
}

export function clientImportHasErrors(rows: ParsedClientImportRow[]): boolean {
  return rows.some(
    (r) => r.errors.length > 0 && r.action !== "skip_duplicate_in_file",
  );
}

/** Rows that should be written (create or update). */
export function clientImportCommitRows(
  rows: ParsedClientImportRow[],
): ParsedClientImportRow[] {
  return rows.filter(
    (r) =>
      r.errors.length === 0 &&
      (r.action === "create" || r.action === "update"),
  );
}

export function parseClientImportCsvFile(formData: FormData):
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
