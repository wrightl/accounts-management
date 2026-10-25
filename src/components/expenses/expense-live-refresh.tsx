"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { fetchEmailExpensesFingerprint } from "@/actions/expenses";

const POLL_MS = 20_000;

/**
 * Refreshes the expenses list when a new expense arrives by email, so the page
 * doesn't need a manual reload. Polls only while the tab is visible and checks
 * straight away when the user comes back to it.
 */
export function ExpenseLiveRefresh({ initialFingerprint }: { initialFingerprint: string }) {
  const router = useRouter();
  const fingerprint = useRef(initialFingerprint);

  // A refresh re-renders the page with the latest marker; adopt it so we
  // don't refresh again for the same change.
  useEffect(() => {
    fingerprint.current = initialFingerprint;
  }, [initialFingerprint]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function check() {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const res = await fetchEmailExpensesFingerprint();
        if (cancelled || !res.ok) return;
        if (res.fingerprint !== fingerprint.current) {
          fingerprint.current = res.fingerprint;
          router.refresh();
        }
      } catch {
        // Network blips are fine; the next tick tries again.
      } finally {
        inFlight = false;
      }
    }

    const id = window.setInterval(check, POLL_MS);
    function onVisibility() {
      if (document.visibilityState === "visible") void check();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}
