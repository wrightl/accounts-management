import type { ActionResult } from "@/actions/result";

/** Fail closed for Ltd-only features when the tenant is a sole trader. */
export function limitedCompanyOnlyError(
  entityType: string | null | undefined,
): ActionResult | null {
  if (entityType !== "limited_company") {
    return {
      ok: false,
      error: "This feature is only available for limited companies.",
    };
  }
  return null;
}
