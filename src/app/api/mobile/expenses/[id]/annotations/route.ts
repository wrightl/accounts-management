import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { setRowLabels, setRowNote } from "@/lib/labels/queries";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { loadMobileExpense } from "@/lib/mobile/expenses";
import { mobileError, mobileServerError } from "@/lib/mobile/respond";
import { ensureLocalUser } from "@/lib/users";

type Params = Promise<{ id: string }>;

const bodySchema = z.object({
  labelIds: z.array(z.string().uuid()).optional(),
  note: z.string().nullable().optional(),
});

/**
 * Set an expense's labels and/or note. Same functions and audit entries as
 * the web's row labels and note; the audit records that the note changed,
 * never what it says.
 */
export async function POST(request: NextRequest, segmentData: { params: Params }) {
  const { id } = await segmentData.params;
  try {
    const authz = await requireMobileAuth("accounts:write", { checkSuspended: true });
    if (!authz.ok) return authz.response;
    const { user } = authz;
    if (!z.string().uuid().safeParse(id).success) return mobileError("Expense not found", 404);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return mobileError("Invalid request", 400);
    const { labelIds, note } = parsed.data;
    const localUserId = await ensureLocalUser(user);

    if (labelIds !== undefined) {
      const result = await setRowLabels(user.companyId, "expense", id, labelIds);
      if (!result.ok) {
        return mobileError(result.error, result.error === "Row not found" ? 404 : 400);
      }
      await writeAudit({
        companyId: user.companyId,
        actorUserId: localUserId,
        action: "expense.set_labels",
        entityType: "expense",
        entityId: id,
        meta: { labelIds },
      });
    }

    if (note !== undefined) {
      const result = await setRowNote(user.companyId, "expense", id, note);
      if (!result.ok) {
        return mobileError(result.error, result.error === "Row not found" ? 404 : 400);
      }
      await writeAudit({
        companyId: user.companyId,
        actorUserId: localUserId,
        action: `expense.${note?.trim() ? "update_note" : "delete_note"}`,
        entityType: "expense",
        entityId: id,
      });
    }

    return NextResponse.json({ success: true, data: await loadMobileExpense(user.companyId, id) });
  } catch (error) {
    return mobileServerError("Expense annotations error", error);
  }
}
