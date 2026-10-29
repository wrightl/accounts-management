"use server";

import { revalidatePath } from "next/cache";
import { requireActionPermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import {
  MENU_FEATURES,
  featureAppliesTo,
  featuresFromAnswers,
  featuresFromFormData,
  isMenuFeature,
  menuAnswersFromFormData,
  type MenuFeature,
} from "@/lib/menu/features";
import {
  getMenuState,
  setDismissedMenuSuggestions,
  setMenuFeatures,
} from "@/lib/menu/queries";
import type { ActionResult } from "@/actions/result";

/**
 * Menu choices are personal, like display settings: anyone who can read the
 * books can change their own menu, even when the company is read-only.
 */
async function menuContext() {
  const authz = await requireActionPermission("accounts:read");
  if (!authz.ok) return authz;
  const { user } = authz;
  if (!user.companyId) {
    return { ok: false as const, error: "Complete onboarding first." };
  }
  const localUserId = await ensureLocalUser(user);
  return {
    ok: true as const,
    companyId: user.companyId,
    entityType: user.entityType,
    localUserId,
  };
}

/** Every write goes through here, so sole traders never store limited-company pages. */
async function saveFeatures(
  ctx: { companyId: string; entityType: string | null; localUserId: string },
  requested: MenuFeature[],
  action: string,
): Promise<ActionResult> {
  const features = requested.filter((f) => featureAppliesTo(f, ctx.entityType));
  await setMenuFeatures(ctx.localUserId, ctx.companyId, features);
  await writeAudit({
    companyId: ctx.companyId,
    actorUserId: ctx.localUserId,
    action,
    entityType: "user",
    entityId: ctx.localUserId,
    meta: { features },
  });
  revalidatePath("/", "layout");
  return { ok: true, id: ctx.localUserId };
}

/** Replace the menu with the items ticked on Settings → Your menu. */
export async function updateMenuFeatures(formData: FormData): Promise<ActionResult> {
  const ctx = await menuContext();
  if (!ctx.ok) return ctx;
  return saveFeatures(ctx, featuresFromFormData(formData), "user.menu.update");
}

/**
 * The dashboard card only asks people who never chose. A stale card (another
 * tab, a double submit) must not overwrite a menu chosen since.
 */
async function hasChosenMenu(ctx: { companyId: string; localUserId: string }) {
  return (await getMenuState(ctx.localUserId, ctx.companyId)).enabled !== null;
}

/** Set the menu from the yes/no questions, for people who skipped onboarding. */
export async function answerMenuQuestions(formData: FormData): Promise<ActionResult> {
  const ctx = await menuContext();
  if (!ctx.ok) return ctx;
  if (await hasChosenMenu(ctx)) return { ok: true, id: ctx.localUserId };
  return saveFeatures(
    ctx,
    featuresFromAnswers(menuAnswersFromFormData(formData), ctx.entityType),
    "user.menu.answer",
  );
}

/**
 * Keep every page but record that this person has chosen, so the questions
 * stop showing and menu suggestions can start.
 */
export async function skipMenuQuestions(): Promise<ActionResult> {
  const ctx = await menuContext();
  if (!ctx.ok) return ctx;
  if (await hasChosenMenu(ctx)) return { ok: true, id: ctx.localUserId };
  return saveFeatures(ctx, [...MENU_FEATURES], "user.menu.skip");
}

/** Add items to the menu (from search or a suggestion), keeping the rest. */
export async function addMenuFeatures(features: string[]): Promise<ActionResult> {
  const ctx = await menuContext();
  if (!ctx.ok) return ctx;
  const adding = features.filter(isMenuFeature);
  if (adding.length === 0) return { ok: false, error: "Nothing to add." };

  const { enabled } = await getMenuState(ctx.localUserId, ctx.companyId);
  // Null already shows everything, so there is nothing to add.
  if (enabled === null) return { ok: true, id: ctx.localUserId };
  const next = new Set([...enabled, ...adding]);
  return saveFeatures(
    ctx,
    MENU_FEATURES.filter((f) => next.has(f)),
    "user.menu.add",
  );
}

/** Stop offering a menu suggestion. */
export async function dismissMenuSuggestion(id: string): Promise<ActionResult> {
  const ctx = await menuContext();
  if (!ctx.ok) return ctx;
  const { dismissed } = await getMenuState(ctx.localUserId, ctx.companyId);
  if (!dismissed.includes(id)) {
    await setDismissedMenuSuggestions(ctx.localUserId, ctx.companyId, [
      ...dismissed,
      id,
    ]);
  }
  revalidatePath("/dashboard");
  return { ok: true, id: ctx.localUserId };
}
