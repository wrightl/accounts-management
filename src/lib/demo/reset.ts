import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, companyMemberships, users } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { collectBlobPaths } from "@/lib/companies/blob-paths";
import { todayIsoDate } from "@/lib/dates";
import { DEMO_LOGO_FILENAME, drawLogoPng, receiptFilename, renderReceiptPdf } from "@/lib/demo/files";
import { generateDemoBooks, type DemoBooks, type DemoPeople } from "@/lib/demo/generate";
import { DEMO_DIRECTORS } from "@/lib/demo/story";
import { NotDemoCompanyError, wipeDemoCompanyData } from "@/lib/demo/wipe";
import { writeDemoBooks, type StoredReceipt } from "@/lib/demo/write";
import { logPlatformEvent } from "@/lib/platform-log";
import { getStorage } from "@/lib/storage";

export { NotDemoCompanyError };

export type DemoResetResult = {
  companyId: string;
  today: string;
  recordsStart: string;
  counts: Record<string, number>;
  durationMs: number;
};

/** Uploads at once; storage calls are slow, so a few run side by side. */
const UPLOAD_CONCURRENCY = 10;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Who plays which part, from the company's members: the earliest admin is the
 * lead director, the second director is found by email, and the earliest
 * accountant is the accountant.
 */
export async function findDemoPeople(companyId: string): Promise<DemoPeople> {
  const members = await getDb()
    .select({ id: users.id, email: users.email, role: companyMemberships.role })
    .from(companyMemberships)
    .innerJoin(users, eq(companyMemberships.userId, users.id))
    .where(eq(companyMemberships.companyId, companyId))
    .orderBy(asc(companyMemberships.createdAt));
  const lead = members.find((m) => m.role === "admin");
  const second = members.find(
    (m) => m.email.toLowerCase() === DEMO_DIRECTORS.second.email.toLowerCase(),
  );
  const accountant = members.find((m) => m.role === "accountant");
  if (!lead || !second || !accountant) {
    throw new Error(
      "The demo company is missing its admin, second director or accountant. Run `npm run demo:create` to set it up.",
    );
  }
  return { leadId: lead.id, secondId: second.id, accountantId: accountant.id };
}

async function storeFiles(companyId: string, books: DemoBooks) {
  const storage = getStorage();
  const batch = `demo/${companyId}/${Date.now().toString(36)}`;
  const logo = await storage.put(`${batch}/${DEMO_LOGO_FILENAME}`, drawLogoPng(), "image/png");
  const receipts = await mapLimit(books.receipts, UPLOAD_CONCURRENCY, async (r): Promise<StoredReceipt> => {
    const bytes = await renderReceiptPdf(r);
    const filename = receiptFilename(r);
    const stored = await storage.put(`${batch}/receipts/${r.expenseId}/${filename}`, bytes, "application/pdf");
    return {
      expenseId: r.expenseId,
      blobPath: stored.path,
      filename,
      contentType: "application/pdf",
      sizeBytes: stored.size,
    };
  });
  return { logoPath: logo.path, receipts };
}

async function deletePaths(paths: string[], companyId: string) {
  const storage = getStorage();
  await mapLimit(paths, UPLOAD_CONCURRENCY, async (path) => {
    try {
      await storage.delete(path);
    } catch (err) {
      await logPlatformEvent({
        level: "warn",
        source: "demo.reset.storage",
        message: err instanceof Error ? err.message : String(err),
        companyId,
        meta: { path },
      });
    }
  });
}

/**
 * Throw away a demo company's records and build them again, counted back from
 * `today`, so the demo always ends on the current date. Only companies flagged
 * `is_demo` can be reset; members, billing and the company id are kept.
 */
export async function resetDemoCompany(options: {
  companyId: string;
  today?: string;
  actorUserId?: string | null;
}): Promise<DemoResetResult> {
  const started = Date.now();
  const { companyId } = options;
  const today = options.today ?? todayIsoDate();
  const db = getDb();

  const [company] = await db
    .select({ isDemo: companies.isDemo })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company?.isDemo) throw new NotDemoCompanyError();

  const people = await findDemoPeople(companyId);
  const books = generateDemoBooks({ companyId, today, people });
  const oldPaths = await collectBlobPaths(companyId);
  const files = await storeFiles(companyId, books);
  const newPaths = [files.logoPath, ...files.receipts.map((r) => r.blobPath)];

  try {
    await db.transaction(async (tx) => {
      // One reset at a time per company.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`demo-reset:${companyId}`}))`);
      await wipeDemoCompanyData(tx, companyId);
      await writeDemoBooks(tx, companyId, books, files);
    });
  } catch (err) {
    await deletePaths(newPaths, companyId);
    throw err;
  }

  const kept = new Set(newPaths);
  await deletePaths(oldPaths.filter((p) => !kept.has(p)), companyId);

  const counts = Object.fromEntries(
    Object.entries(books)
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => [k, (v as unknown[]).length]),
  );
  await writeAudit({
    companyId,
    actorUserId: options.actorUserId ?? null,
    action: "demo.reset",
    entityType: "company",
    entityId: companyId,
    meta: { today, recordsStart: books.recordsStart, invoices: counts.invoices, bankTransactions: counts.bankTransactions },
  });

  return { companyId, today, recordsStart: books.recordsStart, counts, durationMs: Date.now() - started };
}
