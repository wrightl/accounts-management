"use client";

import { createContext, useContext } from "react";
import {
  DEFAULT_DATE_FORMAT,
  formatInstantDate,
  formatInstantDateTime,
  formatIsoDate,
  friendlyDayLabel,
  type DateFormat,
} from "@/lib/dates";

const DateFormatContext = createContext<DateFormat>(DEFAULT_DATE_FORMAT);

export function DateFormatProvider({
  format,
  children,
}: {
  format: DateFormat;
  children: React.ReactNode;
}) {
  return (
    <DateFormatContext.Provider value={format}>
      {children}
    </DateFormatContext.Provider>
  );
}

export function useDateFormat(): DateFormat {
  return useContext(DateFormatContext);
}

/** "Today", "Yesterday", or an ISO date in the signed-in user's chosen format. */
export function FriendlyDay({ iso }: { iso: string }) {
  const format = useDateFormat();
  return <>{friendlyDayLabel(iso, undefined, format)}</>;
}

/** Renders a date in the signed-in user's chosen format. Usable from server and client components. */
export function DisplayDate({
  value,
  withTime = false,
}: {
  /** ISO calendar date, or a timestamp shown in UK civil time. */
  value: string | Date | null | undefined;
  withTime?: boolean;
}) {
  const format = useDateFormat();
  if (!value) return <>—</>;
  if (typeof value === "string") return <>{formatIsoDate(value, format)}</>;
  return (
    <>
      {withTime
        ? formatInstantDateTime(value, format)
        : formatInstantDate(value, format)}
    </>
  );
}
