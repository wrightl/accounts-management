-- Expenses and reimbursements get a reference number that is stored, not worked out at export time:
-- EXP-0001 and REIMB-0001, one series per company and kind. A trigger assigns it on insert, so every
-- creation route is covered, and a number is never changed or reused.
CREATE TABLE "record_counters" (
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"last_number" integer NOT NULL,
	CONSTRAINT "record_counters_company_id_kind_pk" PRIMARY KEY("company_id","kind"),
	CONSTRAINT "record_counters_kind_known" CHECK ("record_counters"."kind" in ('expense', 'reimbursement'))
);
--> statement-breakpoint
ALTER TABLE "record_counters" ADD CONSTRAINT "record_counters_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "ref_number" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD COLUMN "ref_number" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Number existing rows in the order they were entered, never by spend date: an old receipt entered
-- later gets a later number. The id breaks ties so the result is the same every time. No other
-- column is written.
UPDATE "expenses" e
SET "ref_number" = n."rn"
FROM (
	SELECT "id", row_number() OVER (PARTITION BY "company_id" ORDER BY "created_at", "id") AS "rn"
	FROM "expenses"
) n
WHERE e."id" = n."id";
--> statement-breakpoint
UPDATE "reimbursements" r
SET "ref_number" = n."rn"
FROM (
	SELECT "id", row_number() OVER (PARTITION BY "company_id" ORDER BY "created_at", "id") AS "rn"
	FROM "reimbursements"
) n
WHERE r."id" = n."id";
--> statement-breakpoint
-- Each series carries on after the highest number just given.
INSERT INTO "record_counters" ("company_id", "kind", "last_number")
SELECT "company_id", 'expense', max("ref_number") FROM "expenses" GROUP BY "company_id"
UNION ALL
SELECT "company_id", 'reimbursement', max("ref_number") FROM "reimbursements" GROUP BY "company_id";
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_expenses_company_ref_number" ON "expenses" USING btree ("company_id","ref_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_reimbursements_company_ref_number" ON "reimbursements" USING btree ("company_id","ref_number");--> statement-breakpoint
-- The default of 0 only lets inserts leave the column out. If the trigger below were ever missing,
-- these checks stop a row being saved without a number.
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_ref_number_assigned" CHECK ("expenses"."ref_number" > 0);--> statement-breakpoint
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_ref_number_assigned" CHECK ("reimbursements"."ref_number" > 0);--> statement-breakpoint
-- Takes the next number for the row's company, ignoring any value supplied. The upsert locks the
-- counter row until the inserting transaction ends, so two inserts at once queue here and cannot
-- get the same number. If the insert fails or its transaction rolls back, the counter change rolls
-- back with it. Deleting a row leaves the counter alone, so the gap stays.
CREATE FUNCTION "assign_record_number"() RETURNS trigger AS $$
BEGIN
	INSERT INTO "record_counters" AS c ("company_id", "kind", "last_number")
	VALUES (NEW."company_id", TG_ARGV[0], 1)
	ON CONFLICT ("company_id", "kind") DO UPDATE SET "last_number" = c."last_number" + 1
	RETURNING c."last_number" INTO NEW."ref_number";
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE FUNCTION "keep_record_number"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'ref_number on % cannot be changed', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "expenses_assign_ref_number" BEFORE INSERT ON "expenses"
FOR EACH ROW EXECUTE FUNCTION "assign_record_number"('expense');
--> statement-breakpoint
CREATE TRIGGER "reimbursements_assign_ref_number" BEFORE INSERT ON "reimbursements"
FOR EACH ROW EXECUTE FUNCTION "assign_record_number"('reimbursement');
--> statement-breakpoint
CREATE TRIGGER "expenses_keep_ref_number" BEFORE UPDATE OF "ref_number" ON "expenses"
FOR EACH ROW WHEN (NEW."ref_number" IS DISTINCT FROM OLD."ref_number")
EXECUTE FUNCTION "keep_record_number"();
--> statement-breakpoint
CREATE TRIGGER "reimbursements_keep_ref_number" BEFORE UPDATE OF "ref_number" ON "reimbursements"
FOR EACH ROW WHEN (NEW."ref_number" IS DISTINCT FROM OLD."ref_number")
EXECUTE FUNCTION "keep_record_number"();
