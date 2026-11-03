-- One row per draft an assistant asked for, so a retried or overlapping identical call can't create it twice.
CREATE TABLE "assistant_draft_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"request_key" text NOT NULL,
	"entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_assistant_draft_requests_key" ON "assistant_draft_requests" ("company_id", "user_id", "request_key");
