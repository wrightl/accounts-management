"use client";

import type { FormEvent } from "react";

/**
 * Wrap FormData handlers for `<form onSubmit={...}>`.
 *
 * React 19 resets uncontrolled fields when a form `action` completes — including
 * early returns after client validation fails. Using `onSubmit` + `preventDefault`
 * keeps the user's input while showing field errors.
 */
export function preventResetSubmit(
  handler: (formData: FormData, form: HTMLFormElement) => void,
): (event: FormEvent<HTMLFormElement>) => void {
  return (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    handler(new FormData(form), form);
  };
}
