import { cache } from "react";
import { cookies } from "next/headers";
import type { DateFormat } from "@/lib/dates";
import {
  DEFAULT_UI_PREFS,
  parseUiPrefsCookie,
  UI_PREFS_COOKIE,
} from "@/lib/ui-prefs";

/** The signed-in user's date format, for strings built on the server. */
export const getDateFormat = cache(async (): Promise<DateFormat> => {
  const jar = await cookies();
  const prefs =
    parseUiPrefsCookie(jar.get(UI_PREFS_COOKIE)?.value) ?? DEFAULT_UI_PREFS;
  return prefs.dateFormat;
});
