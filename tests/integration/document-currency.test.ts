import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  clients,
  creditNotes,
  invoices,
  invoiceWriteOffs,
  payments,
  users,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { syncFxDifference } from "@/lib/invoices/fx-difference";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { listInvoiceWriteOffs, removeInvoiceWriteOff } from "@/lib/invoices/write-offs";
import { recordInvoicePayment } from "@/lib/payments/record";
import { canPayInvoiceOnline } from "@/lib/payments/online-status";
import { getProfitAndLoss } from "@/lib/reports/queries";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/invoices/fx-difference", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/invoices/fx-difference")>();
  // Pass-through spy: every payment path must keep exchange differences in step.
  return { ...actual, syncFxDifference: vi.fn(actual.syncFxDifference) };
});

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let clientId: string;
let actorId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  companyId = (await seedCompany(db)).id;
  const [client] = await db
    .insert(clients)
    .values({ companyId, name: "Initech Inc", defaultCurrency: "USD" })
    .returning();
  clientId = client.id;
  const [actor] = await db
    .insert(users)
    .values({
      companyId,
      clerkUserId: "user_clerk_fx",
      email: "owner@test.dev",
      name: "Owner",
      role: "admin",
    })
    .returning();
  actorId = actor.id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

/** A sent $70 invoice booked at 1.25 USD per £1, so £56.00 in the books. */
async function usdInvoice(company = companyId, client = clientId, number = "DD-2026-0900") {
  const [inv] = await db
    .insert(invoices)
    .values({
      companyId: company,
      number,
      clientId: client,
      status: "sent",
      issueDate: "2026-05-01",
      dueDate: "2026-05-31",
      currency: "USD",
      fxRate: 1.25,
      fxRateDate: "2026-05-01",
      fxRateSource: "boe",
      netMinor: 7_000,
      vatMinor: 0,
      grossMinor: 7_000,
      netPence: 5_600,
      vatPence: 0,
      grossPence: 5_600,
    })
    .returning();
  return inv;
}

async function pay(invoiceId: string, amountMinor: number, amountPence: number) {
  const [p] = await db
    .insert(payments)
    .values({
      invoiceId,
      amountMinor,
      amountPence,
      method: "bank_transfer",
      receivedAt: new Date("2026-05-20T12:00:00Z"),
    })
    .returning();
  return p;
}

async function sync(invoiceId: string, company = companyId) {
  await db.transaction((tx) =>
    syncFxDifference(tx as never, company, invoiceId, "2026-05-20"),
  );
}

async function fxRows(invoiceId: string) {
  return db
    .select()
    .from(invoiceWriteOffs)
    .where(
      and(eq(invoiceWriteOffs.invoiceId, invoiceId), eq(invoiceWriteOffs.kind, "fx_difference")),
    );
}

describe("sterling documents", () => {
  it("mirrors sterling totals into the document-currency columns", async () => {
    const [inv] = await db
      .insert(invoices)
      .values({
        companyId,
        number: "DD-2026-0901",
        clientId,
        status: "draft",
        netPence: 10_000,
        vatPence: 2_000,
        grossPence: 12_000,
      })
      .returning();
    expect(inv).toMatchObject({ currency: "GBP", fxRate: 1, netMinor: 10_000, grossMinor: 12_000 });

    const [updated] = await db
      .update(invoices)
      .set({ netPence: 5_000, vatPence: 1_000, grossPence: 6_000 })
      .where(eq(invoices.id, inv.id))
      .returning();
    expect(updated.grossMinor).toBe(6_000);

    const [p] = await db
      .insert(payments)
      .values({ invoiceId: inv.id, amountPence: 1_000 } as never)
      .returning();
    expect(p.amountMinor).toBe(1_000);

    const [note] = await db
      .insert(creditNotes)
      .values({
        companyId,
        invoiceId: inv.id,
        clientId,
        number: "CN-0001",
        issueDate: "2026-05-02",
        reason: "Discount",
        netPence: 500,
        grossPence: 500,
      })
      .returning();
    expect(note.grossMinor).toBe(500);
  });

  it("keeps exchange differences in step when a payment is recorded", async () => {
    const [inv] = await db
      .insert(invoices)
      .values({
        companyId,
        number: "DD-2026-0903",
        clientId,
        status: "sent",
        issueDate: "2026-05-01",
        dueDate: "2099-05-31",
        netPence: 10_000,
        grossPence: 10_000,
      })
      .returning();
    const result = await recordInvoicePayment({ companyId, localUserId: actorId }, inv.id, {
      amountPounds: "100.00",
      method: "bank_transfer",
      receivedAt: "2026-05-20",
    });
    expect(result.ok).toBe(true);
    expect(syncFxDifference).toHaveBeenCalledWith(
      expect.anything(),
      companyId,
      inv.id,
      "2026-05-20",
    );
  });

  it("books no exchange difference on a sterling invoice", async () => {
    const [inv] = await db
      .insert(invoices)
      .values({
        companyId,
        number: "DD-2026-0902",
        clientId,
        status: "sent",
        netPence: 10_000,
        grossPence: 10_000,
      })
      .returning();
    await pay(inv.id, 10_000, 10_000);
    await sync(inv.id);
    expect(await fxRows(inv.id)).toHaveLength(0);
  });
});

describe("foreign-currency invoices", () => {
  it("requires the document-currency amount on a payment", async () => {
    const inv = await usdInvoice();
    await expect(
      db.insert(payments).values({ invoiceId: inv.id, amountPence: 5_420 } as never),
    ).rejects.toThrow();
  });

  it("books an exchange loss once the invoice is settled in dollars", async () => {
    const inv = await usdInvoice();
    await pay(inv.id, 7_000, 5_420);
    await sync(inv.id);

    const rows = await fxRows(inv.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amountPence: 180, amountMinor: 0, writtenOffOn: "2026-05-20" });

    const detail = await getInvoiceDetail(companyId, inv.id);
    expect(detail?.balanceMinor).toBe(0);
    expect(detail?.balanceFormatted).toBe("US$0.00");

    const listed = await listInvoiceWriteOffs(companyId, inv.id);
    expect(listed[0]).toMatchObject({
      kindLabel: "Exchange loss",
      amountFormatted: "£1.80",
      removable: false,
    });

    const pnl = await getProfitAndLoss(companyId, "2026-05-01", "2026-05-31");
    expect(pnl.fxDifferencePence).toBe(180);
    expect(pnl.writeOffPence).toBe(0);
  });

  it("books a gain as a negative difference", async () => {
    const inv = await usdInvoice();
    await pay(inv.id, 7_000, 5_700);
    await sync(inv.id);
    expect((await fxRows(inv.id))[0]?.amountPence).toBe(-100);
  });

  it("books nothing while dollars are still owed, and keeps it in step", async () => {
    const inv = await usdInvoice();
    const first = await pay(inv.id, 4_000, 3_100);
    await sync(inv.id);
    expect(await fxRows(inv.id)).toHaveLength(0);

    await pay(inv.id, 3_000, 2_300);
    await sync(inv.id);
    expect((await fxRows(inv.id))[0]?.amountPence).toBe(200);

    // Syncing again changes nothing.
    await sync(inv.id);
    expect(await fxRows(inv.id)).toHaveLength(1);

    // A payment removed: no longer settled, so the difference goes.
    await db.delete(payments).where(eq(payments.id, first.id));
    await sync(inv.id);
    expect(await fxRows(inv.id)).toHaveLength(0);
  });

  it("only touches the named company's invoice", async () => {
    const inv = await usdInvoice();
    await pay(inv.id, 7_000, 5_420);
    const other = (await seedCompany(db, { name: "Other Ltd", slug: "other" })).id;
    await sync(inv.id, other);
    expect(await fxRows(inv.id)).toHaveLength(0);
  });

  it("won't let the user remove an exchange difference", async () => {
    const inv = await usdInvoice();
    await pay(inv.id, 7_000, 5_420);
    await sync(inv.id);
    const [row] = await fxRows(inv.id);
    const result = await removeInvoiceWriteOff({ companyId, localUserId: actorId }, row.id);
    expect(result.ok).toBe(false);
    expect(await fxRows(inv.id)).toHaveLength(1);
  });

  it("doesn't take manual payments or card payments yet", async () => {
    const inv = await usdInvoice();
    const result = await recordInvoicePayment({ companyId, localUserId: actorId }, inv.id, {
      amountPounds: "70.00",
      method: "bank_transfer",
    });
    expect(result.ok).toBe(false);
    expect(
      canPayInvoiceOnline({
        status: "sent",
        amountDuePence: 7_000,
        currency: "USD",
        onlinePayments: "enabled",
      }),
    ).toBe(false);
  });
});
