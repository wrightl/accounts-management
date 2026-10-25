"use client";

import { useEffect, useRef } from "react";
import { useAlert } from "@/components/ui/alert-dialog";

/**
 * Warn before leaving a form with unsaved changes: the browser's own prompt on
 * reload / tab close, and a confirm dialog on in-app link clicks. The App
 * Router has no global navigation hook, so links are caught with a
 * capture-phase click listener that runs before `<Link>`'s handler. Browser
 * back/forward is not intercepted. Programmatic `router.push` (e.g. after a
 * save) is never blocked.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const { confirm } = useAlert();
  const bypass = useRef(false);

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers still need returnValue set to show the prompt.
      e.returnValue = "";
    };

    const onClick = (e: MouseEvent) => {
      if (bypass.current) {
        bypass.current = false;
        return;
      }
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      const here = window.location;
      // In-page hash links don't leave the form.
      if (url.origin === here.origin && url.pathname === here.pathname && url.search === here.search) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      void confirm({
        title: "Discard changes?",
        message: "You have unsaved changes. Leave this page without saving them?",
        confirmLabel: "Leave",
        variant: "destructive",
      }).then((ok) => {
        if (!ok) return;
        window.removeEventListener("beforeunload", onBeforeUnload);
        // Replay the click so <Link> (or the browser) navigates as usual.
        bypass.current = true;
        anchor.click();
      });
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, confirm]);
}
