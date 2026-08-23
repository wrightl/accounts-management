import { sql } from "drizzle-orm";
import { clients } from "@/db/schema";

/** Company name when set, otherwise contact name. */
export const clientDisplayNameSql = sql<string>`
  coalesce(nullif(${clients.companyName}, ''), ${clients.name})
`;
