import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Migrations should use a direct (non-pooled) Neon connection when available.
const url =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
