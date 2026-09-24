import "server-only";
import { eq } from "drizzle-orm";
import { getDb, hasDatabaseClient } from "@/db";
import {
  platformSettings,
  type PlatformSettings,
} from "@/db/schema";

const PLATFORM_SETTINGS_ID = 1;

const DEFAULTS: Omit<PlatformSettings, "updatedAt"> & { updatedAt?: Date } = {
  id: PLATFORM_SETTINGS_ID,
  maintenanceBanner: null,
  defaultReceiptOcrProvider: "local",
  defaultReceiptOcrModel: "google/gemini-2.5-flash",
  lastCronDailyAt: null,
  lastCronInboundAt: null,
  stripePriceEssentialsMonthly: null,
  stripePriceEssentialsYearly: null,
  stripePricePremiumMonthly: null,
  stripePricePremiumYearly: null,
};

/** Ensure the singleton row exists and return it. */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  if (!hasDatabaseClient()) {
    return { ...DEFAULTS, updatedAt: new Date() } as PlatformSettings;
  }
  const db = getDb();
  const [row] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.id, PLATFORM_SETTINGS_ID))
    .limit(1);
  if (row) return row;

  const [created] = await db
    .insert(platformSettings)
    .values({ id: PLATFORM_SETTINGS_ID })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [again] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.id, PLATFORM_SETTINGS_ID))
    .limit(1);
  return again ?? ({ ...DEFAULTS, updatedAt: new Date() } as PlatformSettings);
}

export async function updatePlatformSettings(
  patch: Partial<
    Pick<
      PlatformSettings,
      | "maintenanceBanner"
      | "defaultReceiptOcrProvider"
      | "defaultReceiptOcrModel"
      | "lastCronDailyAt"
      | "lastCronInboundAt"
      | "stripePriceEssentialsMonthly"
      | "stripePriceEssentialsYearly"
      | "stripePricePremiumMonthly"
      | "stripePricePremiumYearly"
    >
  >,
): Promise<PlatformSettings> {
  await getPlatformSettings();
  const db = getDb();
  const [updated] = await db
    .update(platformSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(platformSettings.id, PLATFORM_SETTINGS_ID))
    .returning();
  if (!updated) {
    throw new Error("platform_settings row missing");
  }
  return updated;
}

/** Platform-wide receipt OCR provider + model (not per-company). */
export async function getReceiptOcrSettings(): Promise<{
  provider: string;
  model: string;
}> {
  const settings = await getPlatformSettings();
  return {
    provider: settings.defaultReceiptOcrProvider || "local",
    model: settings.defaultReceiptOcrModel || "google/gemini-2.5-flash",
  };
}
