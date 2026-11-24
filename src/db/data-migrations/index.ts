import { migration as platformAdmin } from "./0001_platform_admin";
import { migration as tokenizeInboundSlugs } from "./0002_tokenize_inbound_slugs";
import { migration as membershipInboundAliases } from "./0003_membership_inbound_aliases";
import { migration as dataOnboardingExisting } from "./0004_data_onboarding_existing";
import { migration as taxCodes } from "./0005_tax_codes";
import { migration as taxCodesCatchUp } from "./0006_tax_codes_catch_up";
import type { DataMigration } from "./types";

/** Ordered install-time data migrations. Add new files and register them here. */
export const dataMigrations: DataMigration[] = [
  platformAdmin,
  tokenizeInboundSlugs,
  membershipInboundAliases,
  dataOnboardingExisting,
  taxCodes,
  taxCodesCatchUp,
];

export type { DataMigration, DataMigrationContext, SideEffect } from "./types";
