import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { auditLog, clients, invoices, users } from "@/db/schema";
import {
  attachInvoiceDocument,
  removeInvoiceDocument,
} from "@/actions/invoice-documents";
import { GET as authedPdf } from "@/app/api/invoices/[id]/pdf/route";
import { GET as publicPdf } from "@/app/i/[token]/pdf/route";
import { sendEmail } from "@/lib/email";
import { enqueueSendJob, processSendJob } from "@/lib/outbox";
import { streamAccountantPack, listStoreZipEntries } from "@/lib/reports/accountant-pack";
import { getStorage } from "@/lib/storage";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_1", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "owner@example.com" },
    firstName: "Owner",
    lastName: "One",
    publicMetadata: {},
  })),
}));
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => ({ id: "email_1" })),
}));

const ORIGINAL = Buffer.from("%PDF-1.4 the original document");

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let clientId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  companyId = (await seedCompany(db)).id;
  await db.insert(users).values({
    companyId,
    clerkUserId: "user_clerk_1",
    email: "owner@example.com",
    name: "Owner",
    role: "admin",
  });
  const [client] = await db
    .insert(clients)
    .values({ companyId, name: "Client", email: "client@example.com" })
    .returning();
  clientId = client.id;
  vi.mocked(sendEmail).mockClear();
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function addInvoice(values: Partial<typeof invoices.$inferInsert> = {}) {
  const [inv] = await db
    .insert(invoices)
    .values({
      companyId,
      clientId,
      number: "OLD-1",
      status: "sent",
      issueDate: "2026-02-01",
      dueDate: "2026-03-01",
      netPence: 1000,
      grossPence: 1000,
      source: "import",
      ...values,
    })
    .returning();
  return inv;
}

function pdfForm(bytes: Buffer = ORIGINAL, name = "original.pdf") {
  const form = new FormData();
  form.set("document", new File([new Uint8Array(bytes)], name));
  return form;
}

async function reload(id: string) {
  const [row] = await db.select().from(invoices).where(eq(invoices.id, id));
  return row;
}

async function bodyOf(res: Response) {
  return Buffer.from(await res.arrayBuffer());
}

describe("attaching an original", () => {
  it("stores the PDF and records it", async () => {
    const inv = await addInvoice();
    expect((await attachInvoiceDocument(inv.id, pdfForm())).ok).toBe(true);
    const row = await reload(inv.id);
    expect(row.originalDocumentFilename).toBe("original.pdf");
    expect(row.originalDocumentSize).toBe(ORIGINAL.length);
    expect(row.originalDocumentSha256).toHaveLength(64);
    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "invoice.document_attach"));
    expect(audits).toHaveLength(1);
  });

  it("rejects a file that isn't really a PDF", async () => {
    const inv = await addInvoice();
    const result = await attachInvoiceDocument(
      inv.id,
      pdfForm(Buffer.from("<html>not a pdf at all</html>"), "fake.pdf"),
    );
    expect(result.ok).toBe(false);
    expect((await reload(inv.id)).originalDocumentPath).toBeNull();
  });

  it("rejects a file over the limit", async () => {
    const inv = await addInvoice();
    const big = Buffer.concat([ORIGINAL, Buffer.alloc(4_500_000)]);
    expect((await attachInvoiceDocument(inv.id, pdfForm(big))).ok).toBe(false);
  });

  it("only applies to imported invoices", async () => {
    const inv = await addInvoice({ source: "alfa" });
    expect((await attachInvoiceDocument(inv.id, pdfForm())).ok).toBe(false);
  });

  it("can't touch another company's invoice", async () => {
    const other = await seedCompany(db, { name: "Other" });
    const [theirClient] = await db
      .insert(clients)
      .values({ companyId: other.id, name: "Theirs" })
      .returning();
    const [theirs] = await db
      .insert(invoices)
      .values({
        companyId: other.id,
        clientId: theirClient.id,
        number: "THEIRS",
        source: "import",
      })
      .returning();
    expect((await attachInvoiceDocument(theirs.id, pdfForm())).ok).toBe(false);
    expect((await removeInvoiceDocument(theirs.id)).ok).toBe(false);
  });

  it("removes the old file when replaced, and the file when removed", async () => {
    const inv = await addInvoice();
    await attachInvoiceDocument(inv.id, pdfForm());
    const first = (await reload(inv.id)).originalDocumentPath!;
    await attachInvoiceDocument(inv.id, pdfForm(ORIGINAL, "second.pdf"));
    const second = (await reload(inv.id)).originalDocumentPath!;
    expect(second).not.toBe(first);
    await expect(getStorage().get(first)).rejects.toThrow();

    expect((await removeInvoiceDocument(inv.id)).ok).toBe(true);
    await expect(getStorage().get(second)).rejects.toThrow();
    expect((await reload(inv.id)).originalDocumentFilename).toBeNull();
  });
});

describe("serving the original", () => {
  async function attached() {
    const inv = await addInvoice();
    await attachInvoiceDocument(inv.id, pdfForm());
    return reload(inv.id);
  }

  it("is served by the signed-in route", async () => {
    const inv = await attached();
    const res = await authedPdf(new Request("http://test/"), {
      params: Promise.resolve({ id: inv.id }),
    });
    expect((await bodyOf(res)).equals(ORIGINAL)).toBe(true);
  });

  it("is served by the public route", async () => {
    const inv = await attached();
    const res = await publicPdf(new Request("http://test/"), {
      params: Promise.resolve({ token: inv.publicToken }),
    });
    expect((await bodyOf(res)).equals(ORIGINAL)).toBe(true);
  });

  it("is attached to the email", async () => {
    const inv = await attached();
    const jobId = await enqueueSendJob("invoice_send", companyId, inv.id, null);
    expect((await processSendJob(jobId)).ok).toBe(true);
    const attachment = vi.mocked(sendEmail).mock.calls[0]![0].attachments![0]!;
    expect(Buffer.from(attachment.content as Buffer).equals(ORIGINAL)).toBe(true);
  });

  it("falls back to a generated PDF if the file has gone", async () => {
    const inv = await attached();
    await getStorage().delete(inv.originalDocumentPath!);
    const res = await authedPdf(new Request("http://test/"), {
      params: Promise.resolve({ id: inv.id }),
    });
    const body = await bodyOf(res);
    expect(body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(body.equals(ORIGINAL)).toBe(false);
  });

  it("is in the accountant pack, for counted and brought-forward invoices", async () => {
    const counted = await addInvoice({ number: "NEW-1", issueDate: "2026-05-01" });
    await attachInvoiceDocument(counted.id, pdfForm());
    const old = await addInvoice({
      number: "OLD-2",
      issueDate: "2026-01-01",
      broughtForward: true,
    });
    await attachInvoiceDocument(old.id, pdfForm());

    const { stream } = await streamAccountantPack({
      companyId,
      from: "2026-04-01",
      to: "2026-06-30",
    });
    const zip = new Uint8Array(await new Response(stream).arrayBuffer());
    const entries = listStoreZipEntries(zip);
    expect(entries).toContain("invoices/NEW-1.pdf");
    expect(entries).toContain("reference/brought-forward-documents/OLD-2.pdf");
    expect(entries).not.toContain("invoices/OLD-2.pdf");
  });
});
