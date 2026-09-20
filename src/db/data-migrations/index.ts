import { migration as platformAdmin } from "./0001_platform_admin";
import type { DataMigration } from "./types";

/** Ordered install-time data migrations. Add new files and register them here. */
export const dataMigrations: DataMigration[] = [platformAdmin];

export type { DataMigration, DataMigrationContext, SideEffect } from "./types";
