import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { hmrcConnections, hmrcOauthStates } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { needsReseal, open, seal } from "@/lib/crypto/secret-box";
import { HMRC_GRANT_MONTHS, hmrcConfig, hmrcEnvironment, type HmrcEnvironment } from "@/lib/hmrc/config";
import {
  exchangeHmrcCode,
  hmrcAuthorizeUrl,
  HmrcOAuthError,
  refreshHmrcTokens,
  type HmrcTokens,
} from "@/lib/hmrc/oauth";

/** How long an admin has to finish granting access on HMRC's site. */
const STATE_TTL_MS = 10 * 60 * 1000;
/** Refresh this long before the access token runs out, so a call never starts with a dying token. */
const REFRESH_MARGIN_MS = 60 * 1000;

function hashState(state: string): string {
  return createHash("sha256").update(state).digest("base64url");
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/** What the settings page shows about a company's HMRC connection. */
export interface HmrcConnectionStatus {
  environment: HmrcEnvironment;
  connected: boolean;
  connectedAt: Date | null;
  grantExpiresAt: Date | null;
  scopes: string[];
  lastUsedAt: Date | null;
  /** Whole days until the grant runs out; null when not connected. */
  daysLeft: number | null;
}

export async function getHmrcConnectionStatus(
  companyId: string,
  environment: HmrcEnvironment = hmrcEnvironment(),
  now: Date = new Date(),
): Promise<HmrcConnectionStatus> {
  const [row] = await getDb()
    .select({
      connectedAt: hmrcConnections.connectedAt,
      grantExpiresAt: hmrcConnections.grantExpiresAt,
      scopes: hmrcConnections.scopes,
      lastUsedAt: hmrcConnections.lastUsedAt,
    })
    .from(hmrcConnections)
    .where(
      and(
        eq(hmrcConnections.companyId, companyId),
        eq(hmrcConnections.environment, environment),
        isNull(hmrcConnections.revokedAt),
      ),
    )
    .limit(1);
  return {
    environment,
    connected: Boolean(row),
    connectedAt: row?.connectedAt ?? null,
    grantExpiresAt: row?.grantExpiresAt ?? null,
    scopes: row ? row.scopes.split(" ").filter(Boolean) : [],
    lastUsedAt: row?.lastUsedAt ?? null,
    daysLeft: row ? Math.ceil((row.grantExpiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) : null,
  };
}

/**
 * Begin connecting: store a one-time state for this company and person, and
 * return the HMRC URL to send them to.
 */
export async function startHmrcConnect(params: { companyId: string; userId: string; now?: Date }): Promise<string> {
  const config = hmrcConfig();
  const now = params.now ?? new Date();
  const state = randomBytes(32).toString("base64url");
  const db = getDb();
  // Expired states for this company are no use to anyone.
  await db
    .delete(hmrcOauthStates)
    .where(and(eq(hmrcOauthStates.companyId, params.companyId), lt(hmrcOauthStates.expiresAt, now)));
  await db.insert(hmrcOauthStates).values({
    companyId: params.companyId,
    userId: params.userId,
    environment: config.environment,
    stateHash: hashState(state),
    expiresAt: new Date(now.getTime() + STATE_TTL_MS),
  });
  return hmrcAuthorizeUrl(config, state);
}

export class HmrcConnectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HmrcConnectError";
  }
}

/**
 * Finish connecting after HMRC redirects back with a code. The state must be
 * one this company's same person started, unused and unexpired; it is used
 * up whatever happens next. Any earlier connection for the company is
 * replaced.
 */
export async function completeHmrcConnect(params: {
  companyId: string;
  userId: string;
  state: string;
  code: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const config = hmrcConfig();
  const now = params.now ?? new Date();
  const db = getDb();

  const [pending] = await db
    .delete(hmrcOauthStates)
    .where(
      and(
        eq(hmrcOauthStates.companyId, params.companyId),
        eq(hmrcOauthStates.stateHash, hashState(params.state)),
      ),
    )
    .returning();
  if (!pending || pending.userId !== params.userId || pending.expiresAt <= now) {
    throw new HmrcConnectError("This HMRC sign-in has expired or wasn't started here. Try connecting again.");
  }
  if (pending.environment !== config.environment) {
    throw new HmrcConnectError("Alfa's HMRC settings changed during sign-in. Try connecting again.");
  }

  const tokens = await exchangeHmrcCode(config, params.code, params.fetchImpl);
  const connectionId = await db.transaction(async (tx) => {
    await tx
      .update(hmrcConnections)
      .set({ revokedAt: now, revokedByUserId: params.userId, accessTokenSealed: null, refreshTokenSealed: null })
      .where(
        and(
          eq(hmrcConnections.companyId, params.companyId),
          eq(hmrcConnections.environment, config.environment),
          isNull(hmrcConnections.revokedAt),
        ),
      );
    const [row] = await tx
      .insert(hmrcConnections)
      .values({
        companyId: params.companyId,
        environment: config.environment,
        scopes: tokens.scopes,
        accessTokenSealed: seal(tokens.accessToken),
        refreshTokenSealed: seal(tokens.refreshToken),
        accessTokenExpiresAt: new Date(now.getTime() + tokens.expiresIn * 1000),
        grantExpiresAt: addMonths(now, HMRC_GRANT_MONTHS),
        connectedByUserId: params.userId,
        connectedAt: now,
      })
      .returning({ id: hmrcConnections.id });
    return row!.id;
  });

  await writeAudit({
    companyId: params.companyId,
    actorUserId: params.userId,
    action: "hmrc.connect",
    entityType: "hmrc_connection",
    entityId: connectionId,
    meta: { environment: config.environment, scopes: tokens.scopes },
  });
}

/**
 * Stop using HMRC for this company. Alfa forgets the tokens; the company can
 * also remove Alfa's authority in its HMRC online account.
 */
export async function disconnectHmrc(params: {
  companyId: string;
  userId: string;
  environment?: HmrcEnvironment;
  now?: Date;
}): Promise<boolean> {
  const environment = params.environment ?? hmrcEnvironment();
  const rows = await getDb()
    .update(hmrcConnections)
    .set({
      revokedAt: params.now ?? new Date(),
      revokedByUserId: params.userId,
      accessTokenSealed: null,
      refreshTokenSealed: null,
    })
    .where(
      and(
        eq(hmrcConnections.companyId, params.companyId),
        eq(hmrcConnections.environment, environment),
        isNull(hmrcConnections.revokedAt),
      ),
    )
    .returning({ id: hmrcConnections.id });
  if (rows.length === 0) return false;
  await writeAudit({
    companyId: params.companyId,
    actorUserId: params.userId,
    action: "hmrc.disconnect",
    entityType: "hmrc_connection",
    entityId: rows[0]!.id,
    meta: { environment },
  });
  return true;
}

export class HmrcNotConnectedError extends Error {
  constructor(message = "This company isn't connected to HMRC. An admin can connect it in Settings.") {
    super(message);
    this.name = "HmrcNotConnectedError";
  }
}

/**
 * A current access token for the company, refreshing it first when it is
 * about to run out. The connection row is locked while refreshing, because
 * HMRC refresh tokens work once: two requests refreshing together would leave
 * one holding a token HMRC has already replaced.
 *
 * If HMRC says the grant is no longer valid (revoked in the company's HMRC
 * account, or past 18 months), the connection is closed so Settings asks for
 * it to be connected again.
 */
export async function getHmrcAccessToken(
  companyId: string,
  options: { now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<{ accessToken: string; connectionId: string }> {
  const config = hmrcConfig();
  const now = options.now ?? new Date();
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(hmrcConnections)
      .where(
        and(
          eq(hmrcConnections.companyId, companyId),
          eq(hmrcConnections.environment, config.environment),
          isNull(hmrcConnections.revokedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!row || !row.accessTokenSealed || !row.refreshTokenSealed) throw new HmrcNotConnectedError();
    if (row.grantExpiresAt <= now) {
      await closeExpired(tx, companyId, row.id, now);
      return { expired: true as const };
    }

    if (row.accessTokenExpiresAt.getTime() - REFRESH_MARGIN_MS > now.getTime()) {
      const reseal =
        needsReseal(row.accessTokenSealed) || needsReseal(row.refreshTokenSealed)
          ? {
              accessTokenSealed: seal(open(row.accessTokenSealed)),
              refreshTokenSealed: seal(open(row.refreshTokenSealed)),
            }
          : {};
      await tx
        .update(hmrcConnections)
        .set({ lastUsedAt: now, ...reseal })
        .where(and(eq(hmrcConnections.id, row.id), eq(hmrcConnections.companyId, companyId)));
      return { accessToken: open(row.accessTokenSealed), connectionId: row.id, refreshed: false };
    }

    let tokens: HmrcTokens;
    try {
      tokens = await refreshHmrcTokens(config, open(row.refreshTokenSealed), options.fetchImpl);
    } catch (e) {
      if (e instanceof HmrcOAuthError && e.needsReconnect) {
        await closeExpired(tx, companyId, row.id, now);
        return { expired: true as const };
      }
      throw e;
    }
    await tx
      .update(hmrcConnections)
      .set({
        accessTokenSealed: seal(tokens.accessToken),
        refreshTokenSealed: seal(tokens.refreshToken),
        accessTokenExpiresAt: new Date(now.getTime() + tokens.expiresIn * 1000),
        scopes: tokens.scopes,
        lastRefreshedAt: now,
        lastUsedAt: now,
      })
      .where(and(eq(hmrcConnections.id, row.id), eq(hmrcConnections.companyId, companyId)));
    return { accessToken: tokens.accessToken, connectionId: row.id, refreshed: true };
  });

  if ("expired" in result) {
    await writeAudit({
      companyId,
      actorUserId: null,
      action: "hmrc.grant_expired",
      entityType: "hmrc_connection",
      meta: { environment: config.environment },
    });
    throw new HmrcNotConnectedError(
      "Alfa's access to HMRC has ended (it lasts 18 months, or was removed in HMRC). An admin can connect again in Settings.",
    );
  }
  if (result.refreshed) {
    await writeAudit({
      companyId,
      actorUserId: null,
      action: "hmrc.refresh",
      entityType: "hmrc_connection",
      entityId: result.connectionId,
    });
  }
  return { accessToken: result.accessToken, connectionId: result.connectionId };
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

async function closeExpired(tx: Tx, companyId: string, connectionId: string, now: Date) {
  await tx
    .update(hmrcConnections)
    .set({ revokedAt: now, accessTokenSealed: null, refreshTokenSealed: null })
    .where(and(eq(hmrcConnections.id, connectionId), eq(hmrcConnections.companyId, companyId)));
}

/** A company's active connections whose grant runs out within the window, for the expiry warnings. */
export async function hmrcConnectionsExpiringBetween(companyId: string, from: Date, to: Date) {
  return getDb()
    .select({
      id: hmrcConnections.id,
      environment: hmrcConnections.environment,
      grantExpiresAt: hmrcConnections.grantExpiresAt,
    })
    .from(hmrcConnections)
    .where(
      and(
        eq(hmrcConnections.companyId, companyId),
        isNull(hmrcConnections.revokedAt),
        gt(hmrcConnections.grantExpiresAt, from),
        lt(hmrcConnections.grantExpiresAt, to),
      ),
    );
}
