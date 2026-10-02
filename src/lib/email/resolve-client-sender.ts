import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companyMemberships, users } from "@/db/schema";
import { serverEnv } from "@/env";
import {
  buildOnBehalfSender,
  type OnBehalfSender,
} from "@/lib/email/on-behalf";
import { getUser } from "@/lib/users";

/**
 * Resolve From / Reply-To for client-facing mail.
 * Prefer the acting user; otherwise the company's earliest admin, then any member.
 */
export async function resolveClientEmailSender(opts: {
  companyId: string;
  companyName: string;
  actorUserId?: string | null;
}): Promise<OnBehalfSender> {
  const emailFrom = serverEnv().EMAIL_FROM;
  const person = await loadSenderPerson(opts.companyId, opts.actorUserId);
  if (!person) {
    return { from: emailFrom };
  }
  return buildOnBehalfSender({
    person,
    companyName: opts.companyName,
    emailFrom,
  });
}

async function loadSenderPerson(
  companyId: string,
  actorUserId: string | null | undefined,
): Promise<{ name: string | null; email: string } | null> {
  if (actorUserId) {
    const user = await getUser(actorUserId);
    if (user?.email) {
      return { name: user.name, email: user.email };
    }
  }

  const db = getDb();
  const admins = await db
    .select({
      name: users.name,
      email: users.email,
    })
    .from(companyMemberships)
    .innerJoin(users, eq(users.id, companyMemberships.userId))
    .where(
      and(
        eq(companyMemberships.companyId, companyId),
        eq(companyMemberships.role, "admin"),
      ),
    )
    .orderBy(asc(companyMemberships.createdAt))
    .limit(1);
  if (admins[0]?.email) {
    return { name: admins[0].name, email: admins[0].email };
  }

  const members = await db
    .select({
      name: users.name,
      email: users.email,
    })
    .from(companyMemberships)
    .innerJoin(users, eq(users.id, companyMemberships.userId))
    .where(eq(companyMemberships.companyId, companyId))
    .orderBy(asc(companyMemberships.createdAt))
    .limit(1);
  if (members[0]?.email) {
    return { name: members[0].name, email: members[0].email };
  }

  return null;
}
