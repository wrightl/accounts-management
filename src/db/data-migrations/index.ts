import { migration as platformAdmin } from "./0001_platform_admin";
import { migration as tokenizeInboundSlugs } from "./0002_tokenize_inbound_slugs";
import { migration as membershipInboundAliases } from "./0003_membership_inbound_aliases";
import type { DataMigration } from "./types";

/** Ordered install-time data migrations. Add new files and register them here. */
export const dataMigrations: DataMigration[] = [
  platformAdmin,
  tokenizeInboundSlugs,
  membershipInboundAliases,
];

export type { DataMigration, DataMigrationContext, SideEffect } from "./types";
