import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { postgresConnectionString } from "./src/db/connection-string";

// Next.js keeps secrets in `.env.local`; also load `.env` for CI/deploy fallbacks.
config({ path: ".env.local" });
config({ path: ".env" });

// Migrations should use a direct (non-pooled) Neon connection when available.
const rawUrl =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";
const url = rawUrl ? postgresConnectionString(rawUrl) : "";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
