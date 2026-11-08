"use client";

import { useEffect } from "react";
import { useClerk } from "@clerk/nextjs";
import { withFreshSession } from "@/lib/fresh-session-fetch";

/**
 * Renew an expired Clerk session token before each server action or in-app
 * navigation, so a save from a tab that sat in the background is not treated
 * as signed out. Renders nothing.
 */
export function FreshSession() {
  const clerk = useClerk();

  useEffect(() => {
    const original = window.fetch;
    window.fetch = withFreshSession(original.bind(window), async () => {
      if (clerk.session) await clerk.session.getToken();
    });
    return () => {
      window.fetch = original;
    };
  }, [clerk]);

  return null;
}
