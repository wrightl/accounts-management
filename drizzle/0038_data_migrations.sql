CREATE TYPE "public"."data_migration_status" AS ENUM('pending_effects', 'applied', 'failed');--> statement-breakpoint
CREATE TABLE "data_migrations" (
	"id" text PRIMARY KEY NOT NULL,
	"checksum" text NOT NULL,
	"status" "public"."data_migration_status" NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
