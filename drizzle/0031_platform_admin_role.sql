ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "company_memberships" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."role" RENAME TO "role_old";--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'user', 'accountant', 'pending', 'platform_admin');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."role" USING (
  CASE
    WHEN "platform_admin" IS TRUE THEN 'platform_admin'::"public"."role"
    ELSE "role"::text::"public"."role"
  END
);--> statement-breakpoint
ALTER TABLE "company_memberships" ALTER COLUMN "role" TYPE "public"."role" USING "role"::text::"public"."role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'pending'::"public"."role";--> statement-breakpoint
ALTER TABLE "company_memberships" ALTER COLUMN "role" SET DEFAULT 'pending'::"public"."role";--> statement-breakpoint
DROP TYPE "public"."role_old";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "platform_admin";
