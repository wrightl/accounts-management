CREATE TABLE "company_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"role" "role" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_memberships" ADD CONSTRAINT "company_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_memberships" ADD CONSTRAINT "company_memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_company_memberships_user_company" ON "company_memberships" USING btree ("user_id","company_id");
--> statement-breakpoint
CREATE INDEX "idx_company_memberships_company" ON "company_memberships" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "idx_company_memberships_user" ON "company_memberships" USING btree ("user_id");
--> statement-breakpoint
INSERT INTO "company_memberships" ("user_id", "company_id", "role")
SELECT "id", "company_id", "role" FROM "users" WHERE "company_id" IS NOT NULL;
