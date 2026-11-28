import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { rateLimitBuckets } from "@/db/schema";
import { clientIpFromForwardedFor } from "@/lib/hmrc/fraud-headers";

/**
 * Rate limits kept in our own Postgres, so they work on any host without an
 * edge firewall or a separate store. Each limit counts calls per key in fixed
 * windows: one upsert per counted call.
 */

export type RateLimit = { limit: number; windowSeconds: number };

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

function windowOf(rule: RateLimit, now: Date): { start: Date; retryAfterSeconds: number } {
  const ms = rule.windowSeconds * 1000;
  const start = Math.floor(now.getTime() / ms) * ms;
  return { start: new Date(start), retryAfterSeconds: Math.max(1, Math.ceil((start + ms - now.getTime()) / 1000)) };
}

/** Count one call against `key`, and say whether it is within the limit. */
export async function hitRateLimit(key: string, rule: RateLimit, now: Date = new Date()): Promise<RateLimitResult> {
  const { start, retryAfterSeconds } = windowOf(rule, now);
  const [row] = await getDb()
    .insert(rateLimitBuckets)
    .values({ key, windowStart: start, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.key, rateLimitBuckets.windowStart],
      set: { count: sql`${rateLimitBuckets.count} + 1` },
    })
    .returning({ count: rateLimitBuckets.count });
  return { allowed: (row?.count ?? 0) <= rule.limit, retryAfterSeconds };
}

/** Whether `key` has already used up this window, without counting a call. */
export async function isOverRateLimit(key: string, rule: RateLimit, now: Date = new Date()): Promise<RateLimitResult> {
  const { start, retryAfterSeconds } = windowOf(rule, now);
  const [row] = await getDb()
    .select({ count: rateLimitBuckets.count })
    .from(rateLimitBuckets)
    .where(and(eq(rateLimitBuckets.key, key), eq(rateLimitBuckets.windowStart, start)))
    .limit(1);
  return { allowed: (row?.count ?? 0) < rule.limit, retryAfterSeconds };
}

/** Delete windows that ended more than a day ago; run by the daily cron. */
export async function purgeOldRateLimitBuckets(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const deleted = await getDb()
    .delete(rateLimitBuckets)
    .where(lt(rateLimitBuckets.windowStart, cutoff))
    .returning({ key: rateLimitBuckets.key });
  return deleted.length;
}

/**
 * The caller's IP, from the header the host's proxy sets. Set CLIENT_IP_HEADER
 * when a host uses another one; whichever it is, the proxy must overwrite it
 * rather than pass on what the client sent, or callers can pick their own IP.
 */
export function clientIp(headers: Headers): string | null {
  const configured = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (configured) return clientIpFromForwardedFor(headers.get(configured));
  return (
    clientIpFromForwardedFor(headers.get("x-forwarded-for")) ?? clientIpFromForwardedFor(headers.get("x-real-ip"))
  );
}
