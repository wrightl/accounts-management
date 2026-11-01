import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import {
  clients,
  companies,
  creditNotes,
  documentSequences,
  invoices,
} from "@/db/schema";
import {
  advanceInvoiceSequences,
  allocateCreditNoteNumber,
  allocateInvoiceNumber,
  allocateOrderNumber,
  allocateQuoteNumber,
  type Tx,
} from "@/lib/invoices/allocate";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let clientId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  companyId = (await seedCompany(db)).id;
  const [client] = await db
    .insert(clients)
    .values({ companyId, name: "Client" })
    .returning();
  clientId = client.id;
});

afterEach(async () => {
  await ctx.client.close();
});

function inTx<T>(fn: (tx: Tx) => Promise<T>) {
  return db.transaction((tx) => fn(tx as unknown as Tx));
}

const invoiceNumber = (date: string) =>
  inTx((tx) => allocateInvoiceNumber(tx, companyId, date));

async function insertInvoice(number: string) {
  await db.insert(invoices).values({ companyId, clientId, number });
}

async function nextSeq(kind: "invoice" | "credit_note", year: number) {
  const [row] = await db
    .select()
    .from(documentSequences)
    .where(
      and(
        eq(documentSequences.companyId, companyId),
        eq(documentSequences.kind, kind),
        eq(documentSequences.year, year),
      ),
    );
  return row?.nextSeq;
}

describe("document number allocation", () => {
  it("keeps the current year's series when a document is backdated", async () => {
    expect(await invoiceNumber("2026-01-10")).toBe("DD-2026-0001");
    expect(await invoiceNumber("2026-01-11")).toBe("DD-2026-0002");
    expect(await invoiceNumber("2025-12-20")).toBe("DD-2025-0001");
    expect(await invoiceNumber("2026-01-12")).toBe("DD-2026-0003");
    expect(await invoiceNumber("2025-12-21")).toBe("DD-2025-0002");
  });

  it("gives each document kind its own series", async () => {
    const date = "2026-03-01";
    await invoiceNumber(date);
    await inTx(async (tx) => {
      expect(await allocateQuoteNumber(tx, companyId, date)).toBe("Q-2026-0001");
      expect(await allocateOrderNumber(tx, companyId, date)).toBe("O-2026-0001");
      expect(await allocateCreditNoteNumber(tx, companyId, date)).toBe(
        "CN-2026-0001",
      );
    });
    expect(await invoiceNumber(date)).toBe("DD-2026-0002");
  });

  it("isolates series between companies", async () => {
    const other = await seedCompany(db, { name: "Other Co" });
    await invoiceNumber("2026-03-01");
    const number = await inTx((tx) =>
      allocateInvoiceNumber(tx, other.id, "2026-03-01"),
    );
    expect(number).toBe("DD-2026-0001");
  });

  it("skips numbers that already exist, ignoring case", async () => {
    await insertInvoice("DD-2026-0001");
    await insertInvoice("dd-2026-0002");
    expect(await invoiceNumber("2026-03-01")).toBe("DD-2026-0003");
  });

  it("does not use up a number when the transaction rolls back", async () => {
    await expect(
      inTx(async (tx) => {
        await allocateInvoiceNumber(tx, companyId, "2026-03-01");
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await invoiceNumber("2026-03-01")).toBe("DD-2026-0001");
  });

  it("hands out unique numbers to concurrent allocations", async () => {
    const numbers = await Promise.all(
      Array.from({ length: 10 }, () => invoiceNumber("2026-03-01")),
    );
    expect(new Set(numbers).size).toBe(10);
  });

  it("throws for an unknown company", async () => {
    await expect(
      inTx((tx) =>
        allocateInvoiceNumber(
          tx,
          "00000000-0000-0000-0000-000000000000",
          "2026-03-01",
        ),
      ),
    ).rejects.toThrow("Company not found");
  });
});

describe("advanceInvoiceSequences", () => {
  it("moves each year's series past imported numbers", async () => {
    await inTx((tx) =>
      advanceInvoiceSequences(tx, companyId, [
        "DD-2026-0010",
        "DD-2025-0099",
        "INV-0043",
      ]),
    );
    expect(await nextSeq("invoice", 2026)).toBe(11);
    expect(await nextSeq("invoice", 2025)).toBe(100);
    expect(await invoiceNumber("2026-03-01")).toBe("DD-2026-0011");
  });

  it("never moves a series backwards", async () => {
    await inTx((tx) => advanceInvoiceSequences(tx, companyId, ["DD-2026-0020"]));
    await inTx((tx) => advanceInvoiceSequences(tx, companyId, ["DD-2026-0005"]));
    expect(await nextSeq("invoice", 2026)).toBe(21);
  });
});

describe("0070 seed", () => {
  async function runSeed() {
    const migration = await readFile(
      "drizzle/0070_document_sequences.sql",
      "utf8",
    );
    const seed = migration.split("--> statement-breakpoint").at(-1)!;
    await ctx.client.exec(seed);
  }

  it("repairs a counter that a backdated invoice already reset", async () => {
    await db
      .update(companies)
      .set({ invoiceNextSeq: 2, invoiceSeqYear: 2025 })
      .where(eq(companies.id, companyId));
    await insertInvoice("DD-2026-0007");
    await insertInvoice("DD-2025-0001");

    await runSeed();

    expect(await nextSeq("invoice", 2026)).toBe(8);
    expect(await nextSeq("invoice", 2025)).toBe(2);
    expect(await invoiceNumber("2026-06-01")).toBe("DD-2026-0008");
  });

  it("keeps an old counter that is ahead of the issued numbers", async () => {
    await db
      .update(companies)
      .set({ invoiceNextSeq: 30, invoiceSeqYear: 2026 })
      .where(eq(companies.id, companyId));
    await insertInvoice("DD-2026-0007");

    await runSeed();

    expect(await nextSeq("invoice", 2026)).toBe(30);
  });

  it("ignores other formats and oversized numbers", async () => {
    await insertInvoice("INV-0043");
    await insertInvoice("XX-2026-0500");
    await insertInvoice("DD-2026-99999999999999");

    await runSeed();

    expect(await nextSeq("invoice", 2026)).toBeUndefined();
  });

  it("seeds credit notes from their own numbers", async () => {
    const [invoice] = await db
      .insert(invoices)
      .values({ companyId, clientId, number: "DD-2026-0001" })
      .returning();
    await db.insert(creditNotes).values({
      companyId,
      invoiceId: invoice.id,
      clientId,
      number: "CN-2026-0004",
      issueDate: "2026-03-01",
      reason: "Overcharged",
    });

    await runSeed();

    expect(await nextSeq("credit_note", 2026)).toBe(5);
  });
});
