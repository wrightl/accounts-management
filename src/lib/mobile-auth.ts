import "server-only";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser, type SessionUser } from "@/lib/auth";
import { can, type Permission } from "@/lib/roles";
import { companies } from "@/db/schema";
import { getDb } from "@/db";
import {
  getEntitlements,
  readOnlyMessage,
} from "@/lib/billing/entitlements";

export type MobileAuthUser = SessionUser & {
  companyId: string;
};

type MobileAuthOk = { ok: true; user: MobileAuthUser };
type MobileAuthFail = { ok: false; response: NextResponse };

/**
 * Authz for mobile API routes. Mirrors web `mutate` / `requirePermission`:
 * 401 unauthenticated, 403 missing permission / company, and for writes
 * refuses suspended companies and read-only billing.
 */
export async function requireMobileAuth(
  permission: Permission,
  options?: { checkSuspended?: boolean },
): Promise<MobileAuthOk | MobileAuthFail> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, success: false, error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }

  if (!can(user.role, permission)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          success: false,
          error: "You do not have permission to do that.",
          code: "no_permission",
        },
        { status: 403 },
      ),
    };
  }

  if (!user.companyId) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          success: false,
          error: "Complete onboarding before using the mobile app.",
          code: "no_company",
        },
        { status: 403 },
      ),
    };
  }

  if (options?.checkSuspended) {
    const db = getDb();
    const [company] = await db
      .select({
        suspendedAt: companies.suspendedAt,
        suspendedReason: companies.suspendedReason,
      })
      .from(companies)
      .where(eq(companies.id, user.companyId))
      .limit(1);
    if (company?.suspendedAt) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            success: false,
            error: company.suspendedReason?.trim()
              ? `This company is suspended: ${company.suspendedReason.trim()}`
              : "This company is suspended. Contact support for help.",
            code: "company_suspended",
          },
          { status: 403 },
        ),
      };
    }

    try {
      const entitlements = await getEntitlements(user.companyId);
      if (entitlements.readOnly) {
        const code =
          entitlements.reason === "trial_expired"
            ? "trial_expired"
            : "plan_read_only";
        return {
          ok: false,
          response: NextResponse.json(
            {
              ok: false,
              success: false,
              error: readOnlyMessage(entitlements.reason),
              code,
            },
            { status: 403 },
          ),
        };
      }
    } catch (err) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "mobile_entitlements_check_failed",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  return {
    ok: true,
    user: { ...user, companyId: user.companyId },
  };
}
