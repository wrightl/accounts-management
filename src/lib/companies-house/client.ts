import "server-only";
import { serverEnv } from "@/env";
import {
  normaliseCompanyNumber,
  parseCompanyProfile,
  parseDirectorNames,
  type CompaniesHouseCompany,
} from "@/lib/companies-house/parse";

const BASE_URL = "https://api.company-information.service.gov.uk";
const TIMEOUT_MS = 8000;

export type CompaniesHouseLookup =
  | { ok: true; company: CompaniesHouseCompany }
  | { ok: false; error: string };

export function companiesHouseConfigured(): boolean {
  return Boolean(serverEnv().COMPANIES_HOUSE_API_KEY);
}

async function getJson(path: string, apiKey: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const body = res.ok ? await res.json() : null;
  return { status: res.status, body };
}

/**
 * The company's profile and current directors from the Companies House
 * public data API. Never throws: failures come back as a message to show.
 */
export async function lookupCompany(companyNumber: string): Promise<CompaniesHouseLookup> {
  const apiKey = serverEnv().COMPANIES_HOUSE_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Companies House lookups aren't set up on this server." };
  }
  const number = normaliseCompanyNumber(companyNumber);
  if (!number) {
    return { ok: false, error: "Enter a company number, e.g. 01234567 or SC123456." };
  }

  try {
    const [profile, officers] = await Promise.all([
      getJson(`/company/${number}`, apiKey),
      getJson(`/company/${number}/officers?items_per_page=100`, apiKey),
    ]);
    if (profile.status === 404) {
      return { ok: false, error: `Companies House has no company ${number}.` };
    }
    if (profile.status === 429) {
      return { ok: false, error: "Companies House is busy. Try again in a few minutes." };
    }
    if (profile.status !== 200) {
      return { ok: false, error: "Companies House didn't respond. Try again, or enter the details by hand." };
    }
    const company = parseCompanyProfile(profile.body);
    if (!company) {
      return { ok: false, error: "Companies House returned details Alfa couldn't read." };
    }
    return {
      ok: true,
      company: {
        ...company,
        directors: officers.status === 200 ? parseDirectorNames(officers.body) : [],
      },
    };
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "companies_house_lookup_failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return { ok: false, error: "Companies House didn't respond. Try again, or enter the details by hand." };
  }
}
