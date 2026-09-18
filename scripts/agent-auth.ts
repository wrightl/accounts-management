/**
 * Mint a one-time Clerk sign-in URL for local UI verification (Cursor agent browser).
 *
 * Usage:
 *   npm run auth:agent
 *   npm run auth:agent -- --email founder@example.com --redirect /settings
 *
 * Prefers Clerk Agent Tasks; falls back to a sign-in token URL if agentTasks is unavailable.
 * Local / development Clerk only — refuses sk_live_ and Vercel/production runtimes.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

import pg from "pg";
import { createClerkClient } from "@clerk/backend";
import { and, asc, inArray, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { postgresConnectionString } from "../src/db/connection-string";
import { schema, users } from "../src/db/schema";
import {
  assertAgentAuthAllowed,
  pickFounder,
  resolveRedirectUrl,
  ticketSignInUrl,
  type FounderCandidate,
} from "../src/lib/agent-auth";

const APP_ORIGIN = "http://localhost:3001";

function parseArgs(argv: string[]) {
  let email: string | null = null;
  let redirect: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--email") {
      email = argv[++i] ?? null;
    } else if (arg?.startsWith("--email=")) {
      email = arg.slice("--email=".length);
    } else if (arg === "--redirect") {
      redirect = argv[++i] ?? null;
    } else if (arg?.startsWith("--redirect=")) {
      redirect = arg.slice("--redirect=".length);
    }
  }
  return { email, redirect };
}

async function loadFounders(connectionString: string): Promise<FounderCandidate[]> {
  const client = new pg.Client({
    connectionString: postgresConnectionString(connectionString),
  });
  await client.connect();
  try {
    const db = drizzle(client, { schema });
    const rows = await db
      .select({
        email: users.email,
        clerkUserId: users.clerkUserId,
        role: users.role,
        companyId: users.companyId,
      })
      .from(users)
      .where(
        and(
          inArray(users.role, ["admin", "user"]),
          isNotNull(users.companyId),
          isNotNull(users.clerkUserId),
        ),
      )
      .orderBy(asc(users.createdAt));

    return rows.map((row) => ({
      email: row.email,
      clerkUserId: row.clerkUserId,
      role: row.role,
      companyId: row.companyId,
    }));
  } finally {
    await client.end();
  }
}

type ClerkClientWithOptionalAgentTasks = ReturnType<typeof createClerkClient> & {
  agentTasks?: {
    create: (params: {
      onBehalfOf: { identifier: string } | { userId: string };
      permissions: string;
      agentName: string;
      taskDescription: string;
      redirectUrl: string;
      sessionMaxDurationInSeconds?: number;
    }) => Promise<{ url: string }>;
  };
};

async function mintSignInUrl(params: {
  secretKey: string;
  email: string;
  clerkUserId: string;
  redirectUrl: string;
}): Promise<string> {
  const client = createClerkClient({
    secretKey: params.secretKey,
  }) as ClerkClientWithOptionalAgentTasks;

  if (typeof client.agentTasks?.create === "function") {
    const task = await client.agentTasks.create({
      onBehalfOf: { identifier: params.email },
      permissions: "*",
      agentName: "cursor-ui",
      taskDescription: "Local UI verification sign-in",
      redirectUrl: params.redirectUrl,
      sessionMaxDurationInSeconds: 60 * 60,
    });
    return task.url;
  }

  const token = await client.signInTokens.createSignInToken({
    userId: params.clerkUserId,
    expiresInSeconds: 60 * 10,
  });
  return ticketSignInUrl(token.token, APP_ORIGIN);
}

async function main() {
  const { email: emailArg, redirect: redirectArg } = parseArgs(process.argv.slice(2));

  const secretKey = process.env.CLERK_SECRET_KEY?.trim() ?? "";
  assertAgentAuthAllowed({
    clerkSecretKey: secretKey,
    nodeEnv: process.env.NODE_ENV,
    vercel: process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV,
  });

  if (!secretKey) {
    throw new Error(
      "CLERK_SECRET_KEY is required. Add a development sk_test_ key to .env.local.",
    );
  }

  const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL (or DATABASE_URL_UNPOOLED) is required.");
  }

  const candidates = await loadFounders(dbUrl);
  const founder = pickFounder(candidates, emailArg);
  const clerkUserId = founder.clerkUserId?.trim();
  if (!clerkUserId) {
    throw new Error(
      `Founder ${founder.email} has no clerk_user_id. Sign in once via the app UI first.`,
    );
  }

  const redirectUrl = resolveRedirectUrl(redirectArg, APP_ORIGIN);
  const url = await mintSignInUrl({
    secretKey,
    email: founder.email,
    clerkUserId,
    redirectUrl,
  });

  console.error(`Signed-in URL for ${founder.email} → ${redirectUrl}`);
  console.log(url);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
