"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { mutate } from "@/lib/mutate";
import { isRole, type Role } from "@/lib/roles";
import type { ActionResult } from "@/actions/result";

const schema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "user", "accountant", "pending"]),
});

export async function updateUserRole(
  userId: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = schema.safeParse({
    userId,
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (!isRole(parsed.data.role)) {
    return { ok: false, error: "Unknown role" };
  }

  return mutate(
    "users:manage",
    async ({ session }) => {
      if (session.userId) {
        const db = getDb();
        const [target] = await db
          .select({ clerkUserId: users.clerkUserId, role: users.role })
          .from(users)
          .where(eq(users.id, parsed.data.userId))
          .limit(1);
        if (!target) return { ok: false, error: "User not found" };
        if (target.clerkUserId === session.userId) {
          return { ok: false, error: "You cannot change your own role" };
        }
        await db
          .update(users)
          .set({ role: parsed.data.role as Role })
          .where(eq(users.id, parsed.data.userId));
        return { ok: true, id: parsed.data.userId };
      }
      return { ok: false, error: "Not signed in" };
    },
    {
      audit: {
        action: "user.role",
        entityType: "user",
        entityId: parsed.data.userId,
        meta: { role: parsed.data.role },
      },
      paths: ["/dashboard/users"],
    },
  );
}
