import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const BREAKPOINT = "--> statement-breakpoint";
const journal = JSON.parse(readFileSync(join(process.cwd(), "drizzle/meta/_journal.json"), "utf8")) as {
  entries: { idx: number; tag: string }[];
};
const sqlOf = (tag: string) => readFileSync(join(process.cwd(), "drizzle", `${tag}.sql`), "utf8");

let client: PGlite;

/** A database as production is before this migration: every earlier migration, and none after. */
beforeEach(async () => {
  client = new PGlite();
  for (const { idx, tag } of journal.entries) {
    if (idx >= 93) break;
    for (const statement of sqlOf(tag).split(BREAKPOINT)) await client.exec(statement);
  }
});

afterEach(async () => {
  await client.close();
});

const runMigration = () =>
  // In one transaction, as the migrator runs it.
  client.transaction(async (tx) => {
    for (const statement of sqlOf("0093_record_references").split(BREAKPOINT)) await tx.exec(statement);
  });

async function company(name: string) {
  const { rows } = await client.query<{ id: string }>(
    `insert into companies (name, legal_name, slug, entity_type)
     values ($1, $1, $2, 'limited_company') returning id`,
    [name, name.toLowerCase().replaceAll(" ", "-")],
  );
  return rows[0]!.id;
}

async function user(companyId: string, email: string) {
  const { rows } = await client.query<{ id: string }>(
    `insert into users (company_id, email, role) values ($1, $2, 'user') returning id`,
    [companyId, email],
  );
  return rows[0]!.id;
}

/** Insert an expense the way it was stored before the migration. */
async function legacyExpense(companyId: string, description: string, createdAt: string, spentAt: string, id?: string) {
  await client.query(
    `insert into expenses (id, company_id, description, spent_at, amount_pence, created_at)
     values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, 1200, $5)`,
    [id ?? null, companyId, description, spentAt, createdAt],
  );
}

async function legacyRun(companyId: string, payeeId: string, reference: string, createdAt: string, id?: string) {
  await client.query(
    `insert into reimbursements (id, company_id, payee_user_id, reference, total_pence, created_at)
     values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, 500, $5)`,
    [id ?? null, companyId, payeeId, reference, createdAt],
  );
}

async function numbered(table: "expenses" | "reimbursements", label: string, companyId: string) {
  const { rows } = await client.query<{ label: string; ref_number: number }>(
    `select ${label} as label, ref_number from ${table} where company_id = $1 order by ref_number`,
    [companyId],
  );
  return rows.map((r) => [r.label, r.ref_number]);
}

/** Every column of every row except the new one, to show nothing else was written. */
async function snapshot(table: "expenses" | "reimbursements") {
  const { rows } = await client.query<{ row: Record<string, unknown> }>(
    `select to_jsonb(t) - 'ref_number' as row from ${table} t order by id`,
  );
  return rows.map((r) => r.row);
}

describe("migration 0093", () => {
  it("numbers existing records per company by when they were entered, not when the money was spent", async () => {
    const a = await company("Alpha Co");
    const b = await company("Beta Co");
    const empty = await company("Empty Co");
    const payeeA = await user(a, "a@x.test");
    const payeeB = await user(b, "b@x.test");

    // Inserted out of order on purpose, so row order on disk cannot give the right answer.
    await legacyExpense(a, "Entered third", "2026-03-01T09:00:00Z", "2026-02-27");
    await legacyExpense(a, "Entered first", "2026-01-05T09:00:00Z", "2026-01-04");
    // An old receipt entered later gets a later number than newer spending entered before it.
    await legacyExpense(a, "Old receipt entered last", "2026-04-01T09:00:00Z", "2024-06-30");
    await legacyExpense(a, "Entered second", "2026-02-01T09:00:00Z", "2026-01-31");
    // Two entered at the same instant (a CSV import): the id decides, the same way every time.
    await legacyExpense(a, "Same instant, higher id", "2026-05-01T09:00:00Z", "2026-05-01", "ffffffff-0000-4000-8000-000000000002");
    await legacyExpense(a, "Same instant, lower id", "2026-05-01T09:00:00Z", "2026-05-01", "00000000-0000-4000-8000-000000000001");
    await legacyExpense(b, "Beta second", "2026-02-02T09:00:00Z", "2026-02-02");
    await legacyExpense(b, "Beta first", "2026-01-01T09:00:00Z", "2026-06-01");

    await legacyRun(a, payeeA, "later", "2026-03-10T09:00:00Z");
    await legacyRun(a, payeeA, "10,11,12,15,17,31", "2026-02-10T09:00:00Z");
    await legacyRun(a, payeeA, "tie high", "2026-04-10T09:00:00Z", "ffffffff-0000-4000-8000-000000000004");
    await legacyRun(a, payeeA, "tie low", "2026-04-10T09:00:00Z", "00000000-0000-4000-8000-000000000003");
    await legacyRun(b, payeeB, "beta only", "2026-01-10T09:00:00Z");

    const before = { expenses: await snapshot("expenses"), reimbursements: await snapshot("reimbursements") };
    await runMigration();

    expect(await numbered("expenses", "description", a)).toEqual([
      ["Entered first", 1],
      ["Entered second", 2],
      ["Entered third", 3],
      ["Old receipt entered last", 4],
      ["Same instant, lower id", 5],
      ["Same instant, higher id", 6],
    ]);
    expect(await numbered("expenses", "description", b)).toEqual([
      ["Beta first", 1],
      ["Beta second", 2],
    ]);
    expect(await numbered("reimbursements", "reference", a)).toEqual([
      ["10,11,12,15,17,31", 1],
      ["later", 2],
      ["tie low", 3],
      ["tie high", 4],
    ]);
    expect(await numbered("reimbursements", "reference", b)).toEqual([["beta only", 1]]);

    // No other field changed, including the typed reimbursement reference.
    expect(await snapshot("expenses")).toEqual(before.expenses);
    expect(await snapshot("reimbursements")).toEqual(before.reimbursements);

    // Each series carries on from its highest number; a company with no records starts at 1.
    const { rows: counters } = await client.query<{ company_id: string; kind: string; last_number: number }>(
      `select company_id, kind, last_number from record_counters`,
    );
    expect(new Set(counters.map((c) => `${c.company_id} ${c.kind} ${c.last_number}`))).toEqual(
      new Set([`${a} expense 6`, `${a} reimbursement 4`, `${b} expense 2`, `${b} reimbursement 1`]),
    );
    await legacyExpense(a, "New after migration", "2020-01-01T09:00:00Z", "2020-01-01");
    await legacyExpense(empty, "First ever", "2026-06-01T09:00:00Z", "2026-06-01");
    await legacyRun(b, payeeB, "new run", "2020-01-01T09:00:00Z");
    expect((await numbered("expenses", "description", a)).at(-1)).toEqual(["New after migration", 7]);
    expect(await numbered("expenses", "description", empty)).toEqual([["First ever", 1]]);
    expect((await numbered("reimbursements", "reference", b)).at(-1)).toEqual(["new run", 2]);
  });

  it("applies cleanly to a database with no expenses or reimbursements", async () => {
    const a = await company("Alpha Co");
    await runMigration();

    await legacyExpense(a, "First", "2026-01-01T09:00:00Z", "2026-01-01");
    expect(await numbered("expenses", "description", a)).toEqual([["First", 1]]);
  });

  it("gives the same numbers whichever order the rows are stored in", async () => {
    const a = await company("Alpha Co");
    const rows = [
      ["One", "2026-01-01T09:00:00Z", "11111111-0000-4000-8000-000000000000"],
      ["Two", "2026-01-01T09:00:00Z", "22222222-0000-4000-8000-000000000000"],
      ["Three", "2026-01-02T09:00:00Z", "00000000-0000-4000-8000-000000000000"],
    ] as const;
    for (const [description, createdAt, id] of [...rows].reverse()) {
      await legacyExpense(a, description, createdAt, "2026-01-01", id);
    }
    // Rewrite the rows so their physical order differs from insertion order.
    await client.exec(`update expenses set notes = 'touched' where description = 'Two'`);
    await runMigration();

    expect(await numbered("expenses", "description", a)).toEqual([
      ["One", 1],
      ["Two", 2],
      ["Three", 3],
    ]);
  });
});
