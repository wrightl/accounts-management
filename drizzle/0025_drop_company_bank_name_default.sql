ALTER TABLE "companies" ALTER COLUMN "bank_name" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "bank_name" DROP NOT NULL;
