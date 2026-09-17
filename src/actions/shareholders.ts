"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { companySettings, shareholders } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { mutate } from "@/lib/mutate";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import type { ActionResult } from "@/actions/result";

const optionalUserId = z
  .string()
  .uuid()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" || !v ? null : v));

const shareholderSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  shareCount: z.coerce.number().int().positive("Share count must be a positive integer"),
  userId: optionalUserId,
});

const SHAREHOLDER_PATHS = ["/shareholders", "/dividends", "/dividends/new"];

async function activeShareSumExcluding(
  companyId: string,
  excludeId: string | null,
): Promise<number> {
  const db = getDb();
  const conditions = [
    eq(shareholders.companyId, companyId),
    isNull(shareholders.archivedAt),
  ];
  if (excludeId) conditions.push(ne(shareholders.id, excludeId));
  const [row] = await db
    .select({
      sum: sql<number>`coalesce(sum(${shareholders.shareCount}), 0)`.mapWith(Number),
    })
    .from(shareholders)
    .where(and(...conditions));
  return row?.sum ?? 0;
}

async function validateAgainstTotal(
  companyId: string,
  nextActiveSum: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const settings = await getOrCreateCompanySettings(companyId);
  if (settings.totalShares == null) return { ok: true };
  if (nextActiveSum !== settings.totalShares) {
    return {
      ok: false,
      error: `Active share counts would be ${nextActiveSum}, but total shares is ${settings.totalShares}. Update total shares or adjust counts so they match.`,
    };
  }
  return { ok: true };
}

export async function updateTotalShares(formData: FormData): Promise<ActionResult> {
  const raw = String(formData.get("totalShares") ?? "").trim();

  if (raw === "") {
    return mutate(
      "accounts:write",
      async ({ companyId, localUserId, entityType }) => {
        if (entityType !== "limited_company") {
          return {
            ok: false,
            error: "Shareholders are only available for limited companies.",
          };
        }
        const db = getDb();
        const settings = await getOrCreateCompanySettings(companyId);
        await db
          .update(companySettings)
          .set({ totalShares: null, updatedAt: new Date() })
          .where(eq(companySettings.id, settings.id));
        await writeAudit({
          companyId,
          actorUserId: localUserId,
          action: "shareholder.total_shares.clear",
          entityType: "company_settings",
          entityId: settings.id,
        });
        return { ok: true, id: settings.id };
      },
      { paths: SHAREHOLDER_PATHS },
    );
  }

  const parsed = z.coerce.number().int().positive().safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Total shares must be a positive integer" };
  }

  return mutate(
    "accounts:write",
    async ({ companyId, localUserId, entityType }) => {
      if (entityType !== "limited_company") {
        return {
          ok: false,
          error: "Shareholders are only available for limited companies.",
        };
      }

      const otherSum = await activeShareSumExcluding(companyId, null);
      if (otherSum !== parsed.data) {
        return {
          ok: false,
          error: `Total shares (${parsed.data}) must equal the sum of active shareholder shares (${otherSum}).`,
        };
      }

      const db = getDb();
      const settings = await getOrCreateCompanySettings(companyId);
      await db
        .update(companySettings)
        .set({ totalShares: parsed.data, updatedAt: new Date() })
        .where(eq(companySettings.id, settings.id));

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "shareholder.total_shares.update",
        entityType: "company_settings",
        entityId: settings.id,
        meta: { totalShares: parsed.data },
      });

      return { ok: true, id: settings.id };
    },
    { paths: SHAREHOLDER_PATHS },
  );
}

export async function createShareholder(formData: FormData): Promise<ActionResult> {
  const parsed = shareholderSchema.safeParse({
    name: formData.get("name"),
    shareCount: formData.get("shareCount"),
    userId: formData.get("userId") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  return mutate(
    "accounts:write",
    async ({ companyId, entityType }) => {
      if (entityType !== "limited_company") {
        return {
          ok: false,
          error: "Shareholders are only available for limited companies.",
        };
      }

      const nextSum =
        (await activeShareSumExcluding(companyId, null)) + parsed.data.shareCount;
      const check = await validateAgainstTotal(companyId, nextSum);
      if (!check.ok) return check;

      const db = getDb();
      const [row] = await db
        .insert(shareholders)
        .values({
          companyId,
          name: parsed.data.name,
          shareCount: parsed.data.shareCount,
          userId: parsed.data.userId,
        })
        .returning({ id: shareholders.id });

      return { ok: true, id: row.id };
    },
    {
      audit: { action: "shareholder.create", entityType: "shareholder" },
      paths: SHAREHOLDER_PATHS,
    },
  );
}

export async function updateShareholder(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = shareholderSchema.safeParse({
    name: formData.get("name"),
    shareCount: formData.get("shareCount"),
    userId: formData.get("userId") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  return mutate(
    "accounts:write",
    async ({ companyId, entityType }) => {
      if (entityType !== "limited_company") {
        return {
          ok: false,
          error: "Shareholders are only available for limited companies.",
        };
      }

      const db = getDb();
      const [existing] = await db
        .select()
        .from(shareholders)
        .where(and(eq(shareholders.id, id), eq(shareholders.companyId, companyId)))
        .limit(1);
      if (!existing) return { ok: false, error: "Shareholder not found" };
      if (existing.archivedAt) {
        return { ok: false, error: "Cannot edit an archived shareholder" };
      }

      const nextSum =
        (await activeShareSumExcluding(companyId, id)) + parsed.data.shareCount;
      const check = await validateAgainstTotal(companyId, nextSum);
      if (!check.ok) return check;

      await db
        .update(shareholders)
        .set({
          name: parsed.data.name,
          shareCount: parsed.data.shareCount,
          userId: parsed.data.userId,
        })
        .where(and(eq(shareholders.id, id), eq(shareholders.companyId, companyId)));

      return { ok: true, id };
    },
    {
      audit: { action: "shareholder.update", entityType: "shareholder", entityId: id },
      paths: SHAREHOLDER_PATHS,
    },
  );
}

export async function archiveShareholder(id: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId, entityType }) => {
      if (entityType !== "limited_company") {
        return {
          ok: false,
          error: "Shareholders are only available for limited companies.",
        };
      }

      const db = getDb();
      const [existing] = await db
        .select()
        .from(shareholders)
        .where(and(eq(shareholders.id, id), eq(shareholders.companyId, companyId)))
        .limit(1);
      if (!existing) return { ok: false, error: "Shareholder not found" };
      if (existing.archivedAt) return { ok: true, id };

      const settings = await getOrCreateCompanySettings(companyId);
      const nextSum = await activeShareSumExcluding(companyId, id);

      await db
        .update(shareholders)
        .set({ archivedAt: new Date() })
        .where(and(eq(shareholders.id, id), eq(shareholders.companyId, companyId)));

      // Keep register balanced: reduce total shares by the archived count when set.
      if (settings.totalShares != null) {
        await db
          .update(companySettings)
          .set({
            totalShares: nextSum > 0 ? nextSum : null,
            updatedAt: new Date(),
          })
          .where(eq(companySettings.id, settings.id));
      }

      return { ok: true, id };
    },
    {
      audit: { action: "shareholder.archive", entityType: "shareholder", entityId: id },
      paths: SHAREHOLDER_PATHS,
    },
  );
}
