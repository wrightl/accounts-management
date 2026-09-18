"use client";

import { useCallback, useState } from "react";
import type { ActionResult } from "@/actions/result";

/** Client-side field error state for FormData-backed forms. */
export function useFieldErrors() {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const clearAll = useCallback(() => {
    setFieldErrors({});
    setError(null);
  }, []);

  const clearField = useCallback((key: string) => {
    setFieldErrors((prev) => {
      if (prev[key] == null) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const applyFail = useCallback(
    (result: {
      error: string;
      fieldErrors?: Record<string, string>;
    }) => {
      setFieldErrors(result.fieldErrors ?? {});
      setError(result.error);
    },
    [],
  );

  const applyActionResult = useCallback(
    (result: ActionResult) => {
      if (result.ok) {
        clearAll();
        return true;
      }
      applyFail(result);
      return false;
    },
    [applyFail, clearAll],
  );

  return {
    fieldErrors,
    error,
    setFieldErrors,
    setError,
    clearAll,
    clearField,
    applyFail,
    applyActionResult,
  };
}
