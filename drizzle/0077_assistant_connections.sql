-- Connecting your own AI assistant over MCP: an admin switch per company, and the assistants each person has connected.
ALTER TABLE "companies" ADD COLUMN "ai_assistant_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE "assistant_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"oauth_client_id" text NOT NULL,
	"client_name" text,
	"first_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_assistant_connections_user_client" ON "assistant_connections" ("user_id", "oauth_client_id");
