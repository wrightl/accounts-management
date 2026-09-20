import type { Database } from "@/db";

export type DataMigrationStatus = "pending_effects" | "applied" | "failed";

export type SideEffect = () => Promise<void>;

export interface DataMigrationContext {
  db: Database;
  /** Queue a post-commit side effect (e.g. Clerk invite). Not rolled back with the DB. */
  queueEffect: (effect: SideEffect) => void;
}

export interface DataMigration {
  id: string;
  up: (ctx: DataMigrationContext) => Promise<void>;
}
