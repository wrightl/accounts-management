-- One number series per company, document kind and calendar year. The single counter on companies
-- restarted whenever a document was dated in a different year, so a backdated invoice could make
-- later ones collide. The old counters stay for one release but are no longer read or written.
CREATE TYPE "public"."document_sequence_kind" AS ENUM('invoice', 'quote', 'order', 'credit_note');
--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"kind" "document_sequence_kind" NOT NULL,
	"year" integer NOT NULL,
	"next_seq" integer NOT NULL,
	PRIMARY KEY ("company_id", "kind", "year")
);
--> statement-breakpoint
-- Each series starts after the highest of the old counter and the numbers already issued under the
-- current prefix. Taking the highest also repairs companies whose counter was already reset.
INSERT INTO "document_sequences" ("company_id", "kind", "year", "next_seq")
SELECT "company_id", "kind"::"document_sequence_kind", "year", max("next_seq")
FROM (
	SELECT "id" AS "company_id", 'invoice' AS "kind", "invoice_seq_year" AS "year", "invoice_next_seq" AS "next_seq"
	FROM "companies" WHERE "invoice_seq_year" IS NOT NULL
	UNION ALL
	SELECT "id", 'quote', "quote_seq_year", "quote_next_seq"
	FROM "companies" WHERE "quote_seq_year" IS NOT NULL
	UNION ALL
	SELECT "id", 'order', "order_seq_year", "order_next_seq"
	FROM "companies" WHERE "order_seq_year" IS NOT NULL
	UNION ALL
	SELECT "id", 'credit_note', "credit_note_seq_year", "credit_note_next_seq"
	FROM "companies" WHERE "credit_note_seq_year" IS NOT NULL
	UNION ALL
	SELECT d."company_id", 'invoice', m.parts[1]::integer, m.parts[2]::integer + 1
	FROM "invoices" d
	JOIN "companies" c ON c."id" = d."company_id"
	CROSS JOIN LATERAL regexp_match(substr(d."number", length(c."invoice_number_prefix") + 2), '^([0-9]{4})-([0-9]{1,9})$') AS m(parts)
	WHERE lower(left(d."number", length(c."invoice_number_prefix") + 1)) = lower(c."invoice_number_prefix" || '-')
		AND m.parts IS NOT NULL
	UNION ALL
	SELECT d."company_id", 'quote', m.parts[1]::integer, m.parts[2]::integer + 1
	FROM "quotes" d
	JOIN "companies" c ON c."id" = d."company_id"
	CROSS JOIN LATERAL regexp_match(substr(d."number", length(c."quote_number_prefix") + 2), '^([0-9]{4})-([0-9]{1,9})$') AS m(parts)
	WHERE lower(left(d."number", length(c."quote_number_prefix") + 1)) = lower(c."quote_number_prefix" || '-')
		AND m.parts IS NOT NULL
	UNION ALL
	SELECT d."company_id", 'order', m.parts[1]::integer, m.parts[2]::integer + 1
	FROM "orders" d
	JOIN "companies" c ON c."id" = d."company_id"
	CROSS JOIN LATERAL regexp_match(substr(d."number", length(c."order_number_prefix") + 2), '^([0-9]{4})-([0-9]{1,9})$') AS m(parts)
	WHERE lower(left(d."number", length(c."order_number_prefix") + 1)) = lower(c."order_number_prefix" || '-')
		AND m.parts IS NOT NULL
	UNION ALL
	SELECT d."company_id", 'credit_note', m.parts[1]::integer, m.parts[2]::integer + 1
	FROM "credit_notes" d
	JOIN "companies" c ON c."id" = d."company_id"
	CROSS JOIN LATERAL regexp_match(substr(d."number", length(c."credit_note_number_prefix") + 2), '^([0-9]{4})-([0-9]{1,9})$') AS m(parts)
	WHERE lower(left(d."number", length(c."credit_note_number_prefix") + 1)) = lower(c."credit_note_number_prefix" || '-')
		AND m.parts IS NOT NULL
) AS seeds
GROUP BY "company_id", "kind", "year";
