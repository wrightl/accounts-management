-- The "Bring in your history" checklist: one row per company once it has been started.
CREATE TABLE "data_onboarding" (
	"company_id" uuid PRIMARY KEY NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"status" text DEFAULT 'active' NOT NULL,
	"records_start_date" date,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_step_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paused_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
