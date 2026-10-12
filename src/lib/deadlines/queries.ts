import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, deadlineFilings, users } from "@/db/schema";
import { todayIsoDate } from "@/lib/dates";
import { addDays } from "@/lib/ledger/corporation-tax";
import {
  deadlineKey,
  deadlineStatus,
  listDeadlines,
  type Deadline,
  type DeadlineStatus,
} from "@/lib/deadlines/calc";

/** How far back unfinished deadlines stay on the list. */
export const LOOKBACK_DAYS = 90;
/** How far ahead the calendar looks. */
export const HORIZON_DAYS = 365;

export type DeadlineRow = Deadline & {
  status: DeadlineStatus;
  /** Days until due; negative when overdue. */
  daysLeft: number;
  filedOn: string | null;
  filedByName: string | null;
};

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export async function getDeadlineSettings(companyId: string) {
  const [row] = await getDb()
    .select({
      entityType: companies.entityType,
      companyNumber: companies.companyNumber,
      financialYearEndMonth: companies.financialYearEndMonth,
      vatRegistered: companies.vatRegistered,
      vatQuarterEndMonth: companies.vatQuarterEndMonth,
      incorporatedOn: companies.incorporatedOn,
      accountsDue: companies.accountsDue,
      confirmationStatementDue: companies.confirmationStatementDue,
      companiesHouseSyncedAt: companies.companiesHouseSyncedAt,
      createdAt: companies.createdAt,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!row) throw new Error("Company not found");
  return row;
}

/**
 * Deadlines from {@link LOOKBACK_DAYS} ago to {@link HORIZON_DAYS} ahead, with
 * whether each has been marked done. Worked-out deadlines from before the
 * company joined Alfa are left out; Companies House's own dates always show.
 */
export async function getDeadlines(
  companyId: string,
  today: string = todayIsoDate(),
  horizonDays: number = HORIZON_DAYS,
) {
  const db = getDb();
  const settings = await getDeadlineSettings(companyId);
  const joined = todayIsoDate(settings.createdAt);
  const from = addDays(today, -LOOKBACK_DAYS);
  const to = addDays(today, horizonDays);

  const filings = await db
    .select({
      kind: deadlineFilings.kind,
      dueDate: deadlineFilings.dueDate,
      filedOn: deadlineFilings.filedOn,
      filedByName: users.name,
      filedByEmail: users.email,
    })
    .from(deadlineFilings)
    .leftJoin(users, eq(users.id, deadlineFilings.filedByUserId))
    .where(eq(deadlineFilings.companyId, companyId));
  const filed = new Map(filings.map((f) => [deadlineKey(f), f]));

  const deadlines: DeadlineRow[] = listDeadlines(settings, from, to)
    .filter((d) => d.source === "companies_house" || d.dueDate >= joined)
    .map((d) => {
      const filing = filed.get(deadlineKey(d));
      return {
        ...d,
        status: deadlineStatus(d.dueDate, today, Boolean(filing)),
        daysLeft: daysBetween(today, d.dueDate),
        filedOn: filing?.filedOn ?? null,
        filedByName: filing ? (filing.filedByName ?? filing.filedByEmail ?? null) : null,
      };
    })
    // Done ones stay only while they're still in the future or recent.
    .filter((d) => d.status !== "done" || d.dueDate >= addDays(today, -30));

  const isLtd = settings.entityType === "limited_company";
  return {
    today,
    settings,
    deadlines,
    /** Ltd without any Companies House dates: the confirmation statement can't be shown. */
    missingCompaniesHouse:
      isLtd && !settings.incorporatedOn && !settings.confirmationStatementDue,
  };
}

/** Open deadlines due within `days` (including overdue ones), soonest first. */
export async function getUpcomingDeadlines(
  companyId: string,
  days: number,
  today: string = todayIsoDate(),
): Promise<DeadlineRow[]> {
  const { deadlines } = await getDeadlines(companyId, today, days);
  return deadlines.filter((d) => d.status !== "done");
}
