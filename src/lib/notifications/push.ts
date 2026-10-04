import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pushSubscriptions, type PushPlatform } from "@/db/schema";
import { serverEnv } from "@/env";

export type PushPayload = {
  userId: string;
  title: string;
  body: string;
  href?: string | null;
  notificationId?: string | null;
  type?: string;
};

export async function upsertPushSubscription(opts: {
  userId: string;
  companyId?: string | null;
  platform: PushPlatform;
  endpoint: string;
  keys?: { p256dh?: string; auth?: string } | null;
  userAgent?: string | null;
}): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(pushSubscriptions)
    .values({
      userId: opts.userId,
      companyId: opts.companyId ?? null,
      platform: opts.platform,
      endpoint: opts.endpoint,
      keys: opts.keys ?? null,
      userAgent: opts.userAgent ?? null,
      lastUsedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
      set: {
        platform: opts.platform,
        keys: opts.keys ?? null,
        userAgent: opts.userAgent ?? null,
        companyId: opts.companyId ?? null,
        lastUsedAt: new Date(),
      },
    })
    .returning({ id: pushSubscriptions.id });
  return row.id;
}

export async function deletePushSubscription(
  userId: string,
  endpoint: string,
): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    )
    .returning({ id: pushSubscriptions.id });
  return deleted.length > 0;
}

export async function sendPushToUser(payload: PushPayload): Promise<void> {
  const db = getDb();
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, payload.userId));

  if (subs.length === 0) return;

  await Promise.allSettled(
    subs.map(async (sub) => {
      if (sub.platform === "web") {
        await sendWebPush(sub, payload);
      } else {
        await sendFcmPush(sub.endpoint, payload);
      }
    }),
  );
}

async function sendWebPush(
  sub: typeof pushSubscriptions.$inferSelect,
  payload: PushPayload,
): Promise<void> {
  const env = serverEnv();
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    return;
  }
  if (!sub.keys?.p256dh || !sub.keys?.auth) return;

  const webpush = await import("web-push");
  webpush.setVapidDetails(subject, publicKey, privateKey);

  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
        },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        href: payload.href ?? "/inbox",
        notificationId: payload.notificationId,
        type: payload.type,
      }),
    );
  } catch (error) {
    const status =
      error && typeof error === "object" && "statusCode" in error
        ? Number((error as { statusCode: number }).statusCode)
        : 0;
    if (status === 404 || status === 410) {
      await deletePushSubscription(sub.userId, sub.endpoint);
    } else {
      throw error;
    }
  }
}

/**
 * FCM HTTP v1 using a service-account JSON in FCM_SERVICE_ACCOUNT_JSON
 * and project id in FCM_PROJECT_ID. No-op when unset.
 */
async function sendFcmPush(
  token: string,
  payload: PushPayload,
): Promise<void> {
  const env = serverEnv();
  const projectId = env.FCM_PROJECT_ID;
  const saJson = env.FCM_SERVICE_ACCOUNT_JSON;
  if (!projectId || !saJson) return;

  let accessToken: string;
  try {
    accessToken = await getGoogleAccessToken(saJson);
  } catch {
    return;
  }

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: {
            href: payload.href ?? "/inbox",
            notificationId: payload.notificationId ?? "",
            type: payload.type ?? "",
          },
        },
      }),
    },
  );

  if (res.status === 404 || res.status === 410) {
    await deletePushSubscriptionByEndpoint(token);
    return;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FCM error ${res.status}: ${text}`);
  }
}

async function deletePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
  const db = getDb();
  await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
}

async function getGoogleAccessToken(saJson: string): Promise<string> {
  const sa = JSON.parse(saJson) as {
    client_email: string;
    private_key: string;
    token_uri?: string;
  };
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const key = await importPkcs8(sa.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${b64url(sig)}`;

  const tokenRes = await fetch(
    sa.token_uri ?? "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    },
  );
  if (!tokenRes.ok) {
    throw new Error(`Google token error ${tokenRes.status}`);
  }
  const data = (await tokenRes.json()) as { access_token: string };
  return data.access_token;
}

function b64url(input: string | ArrayBuffer): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPkcs8(pem: string): Promise<CryptoKey> {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}
