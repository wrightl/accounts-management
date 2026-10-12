import { z } from "zod";

/** What Alfa uses from a Companies House company profile. */
export type CompaniesHouseCompany = {
  companyNumber: string;
  companyName: string;
  status: string | null;
  incorporatedOn: string | null;
  /** Registered office, one line per part. */
  registeredOffice: string | null;
  /** Month (1–12) of the accounting reference date, i.e. the year end. */
  yearEndMonth: number | null;
  accountsDue: string | null;
  confirmationStatementDue: string | null;
  /** Current directors as "Forename Surname". */
  directors: string[];
};

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullish()
  .catch(null);

const profileSchema = z.object({
  company_number: z.string(),
  company_name: z.string(),
  company_status: z.string().nullish(),
  date_of_creation: isoDate,
  registered_office_address: z
    .object({
      care_of: z.string().nullish(),
      po_box: z.string().nullish(),
      premises: z.string().nullish(),
      address_line_1: z.string().nullish(),
      address_line_2: z.string().nullish(),
      locality: z.string().nullish(),
      region: z.string().nullish(),
      postal_code: z.string().nullish(),
      country: z.string().nullish(),
    })
    .nullish(),
  accounts: z
    .object({
      accounting_reference_date: z
        .object({ month: z.coerce.number().int().min(1).max(12) })
        .nullish()
        .catch(null),
      next_due: isoDate,
    })
    .nullish(),
  confirmation_statement: z.object({ next_due: isoDate }).nullish(),
});

const officersSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string(),
        officer_role: z.string().nullish(),
        resigned_on: z.string().nullish(),
      }),
    )
    .default([]),
});

/**
 * Company numbers are 8 characters: digits padded with zeros, or a two-letter
 * prefix (SC, NI, OC…) and six digits. Null when it can't be one.
 */
export function normaliseCompanyNumber(input: string): string | null {
  const compact = input.replace(/\s+/g, "").toUpperCase();
  if (/^\d{1,8}$/.test(compact)) return compact.padStart(8, "0");
  if (/^[A-Z]{2}\d{6}$/.test(compact)) return compact;
  return null;
}

function titleCase(word: string): string {
  return word
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** "SMITH, Jane Anne" → "Jane Anne Smith". Names without a comma are kept. */
export function officerDisplayName(name: string): string {
  const [surname, forenames] = name.split(/,\s*/, 2);
  if (!forenames) return name.trim();
  return `${forenames.trim()} ${titleCase(surname!.trim())}`;
}

export function parseCompanyProfile(body: unknown): CompaniesHouseCompany | null {
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) return null;
  const p = parsed.data;
  const office = p.registered_office_address;
  const officeLines = office
    ? [
        office.care_of ? `c/o ${office.care_of}` : null,
        office.po_box ? `PO Box ${office.po_box}` : null,
        [office.premises, office.address_line_1].filter(Boolean).join(" ") || null,
        office.address_line_2,
        office.locality,
        office.region,
        office.postal_code,
        office.country,
      ].filter((line): line is string => Boolean(line?.trim()))
    : [];
  return {
    companyNumber: p.company_number,
    companyName: p.company_name,
    status: p.company_status ?? null,
    incorporatedOn: p.date_of_creation ?? null,
    registeredOffice: officeLines.length ? officeLines.join("\n") : null,
    yearEndMonth: p.accounts?.accounting_reference_date?.month ?? null,
    accountsDue: p.accounts?.next_due ?? null,
    confirmationStatementDue: p.confirmation_statement?.next_due ?? null,
    directors: [],
  };
}

/** Current (not resigned) directors, in the order Companies House lists them. */
export function parseDirectorNames(body: unknown): string[] {
  const parsed = officersSchema.safeParse(body);
  if (!parsed.success) return [];
  return parsed.data.items
    .filter((o) => !o.resigned_on && (o.officer_role ?? "").endsWith("director"))
    .map((o) => officerDisplayName(o.name));
}

/**
 * A friendlier trading name from the registered one: "ACME CONSULTING LTD"
 * becomes "Acme Consulting". Names already in mixed case keep their casing.
 */
export function suggestTradingName(registeredName: string): string {
  const stripped = registeredName
    .trim()
    .replace(/\s+(LTD\.?|LIMITED|PLC|LLP)$/i, "")
    .trim();
  const base = stripped || registeredName.trim();
  return base === base.toUpperCase() ? titleCase(base) : base;
}
