"use server";

import { mutate } from "@/lib/mutate";
import { recordWeeklyClose } from "@/lib/close/record";
import type { ActionResult } from "@/actions/result";

/**
 * Sign off the week. Items still open are recorded with the close, so the
 * accountant can see what was left.
 */
export async function closeWeek(): Promise<ActionResult> {
  return mutate("accounts:write", recordWeeklyClose, {
    audit: { action: "close.week", entityType: "weekly_close" },
    paths: ["/close", "/reports", "/dashboard"],
  });
}
