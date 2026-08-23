import {
  EXPENSE_CATEGORIES,
  isExpenseCategory,
  type ExpenseCategory,
} from "@/lib/expenses/categories";

export type ReceiptExtraction = {
  description?: string;
  amountPounds?: string;
  spentAt?: string;
  category?: ExpenseCategory;
  merchant?: string;
  confidence: "high" | "partial" | "none";
};

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const CATEGORY_KEYWORDS: { category: ExpenseCategory; keywords: string[] }[] = [
  {
    category: "Travel",
    keywords: ["uber", "lyft", "taxi", "train", "rail", "flight", "airline", "hotel", "parking", "fuel", "petrol", "shell", "bp "],
  },
  {
    category: "Meals",
    keywords: ["restaurant", "cafe", "coffee", "starbucks", "pret", "deliveroo", "just eat", "ubereats", "lunch", "dinner"],
  },
  {
    category: "Software",
    keywords: ["aws", "amazon web", "github", "vercel", "google cloud", "microsoft", "adobe", "slack", "notion", "figma", "subscription", "saas"],
  },
  {
    category: "Office",
    keywords: ["staples", "office", "stationery", "paper", "printer", "post office", "royal mail"],
  },
  {
    category: "Marketing",
    keywords: ["advert", "ads", "facebook", "linkedin", "google ads", "marketing", "campaign"],
  },
  {
    category: "Professional fees",
    keywords: ["accountant", "legal", "solicitor", "consultant", "professional", "accounting"],
  },
  {
    category: "Equipment",
    keywords: ["apple store", "currys", "amazon", "hardware", "computer", "laptop", "monitor"],
  },
  {
    category: "Training",
    keywords: ["course", "training", "udemy", "pluralsight", "conference", "workshop"],
  },
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDate(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) {
    return undefined;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseDmyMatch(match: RegExpMatchArray): string | undefined {
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  return toIsoDate(year, month, day);
}

export function parseReceiptDate(text: string): string | undefined {
  const labeled = text.match(
    /(?:Document Date|Invoice Date|Tax Invoice Date|Transaction Date|Date)[:\s]*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i,
  );
  if (labeled?.[1]) {
    const dmy = labeled[1].match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (dmy) {
      const iso = parseDmyMatch(dmy);
      if (iso) return iso;
    }
  }

  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const dmy = line.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
    if (dmy) {
      const iso = parseDmyMatch(dmy);
      if (iso) return iso;
    }

    const ymd = line.match(/\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b/);
    if (ymd) {
      const iso = toIsoDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
      if (iso) return iso;
    }

    const named = line.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})\b/i);
    if (named) {
      const day = Number(named[1]);
      const month = MONTHS[named[2].toLowerCase()];
      if (month) {
        let year = Number(named[3]);
        if (year < 100) year += 2000;
        const iso = toIsoDate(year, month, day);
        if (iso) return iso;
      }
    }
  }

  return undefined;
}

export function parseReceiptAmount(text: string): string | undefined {
  const candidates: number[] = [];
  const amountPatterns = [
    /(?:total|amount due|balance due|grand total|to pay)[^\d]{0,60}(\d+[.,]\d{2})/gi,
    /GBP\s*(\d+[.,]\d{2})/gi,
    /£\s*(\d+[.,]\d{2})/g,
    /(\d+[.,]\d{2})\s*(?:GBP|£)/gi,
  ];

  for (const pattern of amountPatterns) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[1]?.replace(",", ".");
      if (!raw) continue;
      const value = Number(raw);
      if (Number.isFinite(value) && value > 0 && value < 1_000_000) {
        candidates.push(value);
      }
    }
  }

  if (candidates.length === 0) return undefined;
  const max = Math.max(...candidates);
  return max.toFixed(2);
}

const MERCHANT_SKIP =
  /^(receipt|invoice|tax|vat|total|date|time|tel|phone|www\.|http|billing summary|summary|sold to|bill to|payment instructions|questions on)/i;

export function parseReceiptMerchant(text: string): string | undefined {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 3);

  const companyLine = lines.slice(0, 15).find(
    (line) =>
      !/^\d/.test(line) &&
      !MERCHANT_SKIP.test(line) &&
      /(?:Limited|Ltd\.?|LLC|Inc\.?|PLC)\b/i.test(line) &&
      line.length <= 80,
  );
  if (companyLine) return companyLine;

  for (const line of lines.slice(0, 12)) {
    if (/^\d/.test(line)) continue;
    if (MERCHANT_SKIP.test(line)) continue;
    if (/^[£$€]/.test(line)) continue;
    if (line.length > 80) continue;
    return line;
  }

  return undefined;
}

function keywordMatches(text: string, keyword: string): boolean {
  const trimmed = keyword.trim().toLowerCase();
  if (/\s/.test(trimmed)) {
    return text.includes(trimmed);
  }
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

export function inferReceiptCategory(text: string): ExpenseCategory | undefined {
  const lower = text.toLowerCase();
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => keywordMatches(lower, kw))) {
      return category;
    }
  }
  return undefined;
}

export function parseReceiptText(text: string): ReceiptExtraction {
  const merchant = parseReceiptMerchant(text);
  const amountPounds = parseReceiptAmount(text);
  const spentAt = parseReceiptDate(text);
  const category = inferReceiptCategory(text);
  const description = merchant;

  const fields = [description, amountPounds, spentAt, category].filter(Boolean);
  let confidence: ReceiptExtraction["confidence"] = "none";
  if (fields.length >= 3) confidence = "high";
  else if (fields.length >= 1) confidence = "partial";

  return {
    description,
    amountPounds,
    spentAt,
    category,
    merchant,
    confidence,
  };
}

export function normalizeAiExtraction(raw: {
  description?: string | null;
  amountPounds?: string | null;
  spentAt?: string | null;
  category?: string | null;
  merchant?: string | null;
}): ReceiptExtraction {
  const description = raw.description?.trim() || raw.merchant?.trim() || undefined;
  const amountPounds = raw.amountPounds?.trim() || undefined;
  const spentAt = raw.spentAt?.match(/^\d{4}-\d{2}-\d{2}$/) ? raw.spentAt : undefined;
  const category =
    raw.category && isExpenseCategory(raw.category) ? raw.category : undefined;

  const fields = [description, amountPounds, spentAt, category].filter(Boolean);
  let confidence: ReceiptExtraction["confidence"] = "none";
  if (fields.length >= 3) confidence = "high";
  else if (fields.length >= 1) confidence = "partial";

  return {
    description,
    amountPounds,
    spentAt,
    category,
    merchant: raw.merchant?.trim() || undefined,
    confidence,
  };
}

export function receiptOcrProviderLabel(provider: string, model?: string): string {
  if (provider === "ai_gateway") {
    return model
      ? `Vercel AI Gateway (${model})`
      : "Vercel AI Gateway";
  }
  return "Local extraction (PDF text + Tesseract for images)";
}

export function isReceiptOcrProvider(value: string): value is "local" | "ai_gateway" {
  return value === "local" || value === "ai_gateway";
}

export { EXPENSE_CATEGORIES };
