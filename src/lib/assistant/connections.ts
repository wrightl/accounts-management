import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { assistantConnections } from "@/db/schema";

export type AssistantConnection = {
  id: string;
  /** What the assistant called itself when it connected; anyone can claim any name. */
  name: string | null;
  /** The OAuth client it signed in as, which Clerk vouches for. */
  oauthClientId: string;
  firstUsedAt: Date;
  lastUsedAt: Date;
  disconnectedAt: Date | null;
  allowDrafts: boolean;
};

/** The assistants this person has connected to Alfa, most recently used first. */
export async function listAssistantConnections(localUserId: string): Promise<AssistantConnection[]> {
  return getDb()
    .select({
      id: assistantConnections.id,
      name: assistantConnections.clientName,
      oauthClientId: assistantConnections.oauthClientId,
      firstUsedAt: assistantConnections.firstUsedAt,
      lastUsedAt: assistantConnections.lastUsedAt,
      disconnectedAt: assistantConnections.revokedAt,
      allowDrafts: assistantConnections.allowDrafts,
    })
    .from(assistantConnections)
    .where(eq(assistantConnections.userId, localUserId))
    .orderBy(desc(assistantConnections.lastUsedAt));
}

/**
 * Disconnect one of this person's assistants, or allow it again. Scoped to
 * their own connections; returns the client id, or null when it isn't theirs.
 */
export async function setAssistantDisconnected(
  localUserId: string,
  connectionId: string,
  disconnected: boolean,
): Promise<string | null> {
  const [row] = await getDb()
    .update(assistantConnections)
    .set({ revokedAt: disconnected ? new Date() : null })
    .where(and(eq(assistantConnections.id, connectionId), eq(assistantConnections.userId, localUserId)))
    .returning({ oauthClientId: assistantConnections.oauthClientId });
  return row?.oauthClientId ?? null;
}

/**
 * Let one of this person's assistants create drafts, or stop it. Scoped to
 * their own connections; returns the client id, or null when it isn't theirs.
 */
export async function setAssistantDraftsAllowed(
  localUserId: string,
  connectionId: string,
  allowDrafts: boolean,
): Promise<string | null> {
  const [row] = await getDb()
    .update(assistantConnections)
    .set({ allowDrafts })
    .where(and(eq(assistantConnections.id, connectionId), eq(assistantConnections.userId, localUserId)))
    .returning({ oauthClientId: assistantConnections.oauthClientId });
  return row?.oauthClientId ?? null;
}
