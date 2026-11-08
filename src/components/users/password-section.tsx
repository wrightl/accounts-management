"use client";

import { useRef, useState } from "react";
import { useReverification, useUser } from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import {
  clerkErrorMessage,
  parsePasswordChange,
  PASSWORD_MIN_LENGTH,
} from "@/lib/password/schema";

export function PasswordSection() {
  const { isLoaded, user } = useUser();
  const { fieldErrors, error, setError, clearAll, clearField, applyFail } =
    useFieldErrors();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  // Clerk may ask the user to confirm who they are before a password change.
  const updatePassword = useReverification(
    (params: {
      newPassword: string;
      currentPassword?: string;
      signOutOfOtherSessions: boolean;
    }) => {
      if (!user) throw new Error("Not signed in");
      return user.updatePassword(params);
    },
  );

  if (!isLoaded || !user) return null;
  const hasPassword = user.passwordEnabled;

  async function onSubmit(formData: FormData) {
    clearAll();
    setSaved(false);
    const parsed = parsePasswordChange(formData, hasPassword);
    if (!parsed.ok) {
      applyFail(parsed);
      scheduleFocusFirstFieldError(formRef.current, parsed.fieldErrors);
      return;
    }
    setPending(true);
    try {
      await updatePassword({
        newPassword: parsed.data.newPassword,
        currentPassword: parsed.data.currentPassword,
        signOutOfOtherSessions: formData.get("signOutOthers") === "on",
      });
      formRef.current?.reset();
      setSaved(true);
    } catch (err) {
      if (!isReverificationCancelledError(err)) {
        setError(clerkErrorMessage(err, "Your password could not be changed"));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="border-t border-border pt-8">
      <h2 className="font-display text-lg font-semibold">Password</h2>
      <p className="mt-1 text-sm text-muted">
        {hasPassword
          ? "Change the password you use to sign in."
          : "You sign in without a password. Set one to also sign in with your email and a password."}
      </p>
      <form
        ref={formRef}
        noValidate
        onSubmit={preventResetSubmit(onSubmit)}
        className="mt-4 space-y-4"
      >
        {/* Lets password managers link the new password to this account. */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={user.primaryEmailAddress?.emailAddress ?? ""}
          readOnly
          hidden
        />
        {hasPassword ? (
          <PasswordField
            id="currentPassword"
            label="Current password"
            autoComplete="current-password"
            pending={pending}
            error={fieldErrors.currentPassword}
            onChange={() => clearField("currentPassword")}
          />
        ) : null}
        <PasswordField
          id="newPassword"
          label="New password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          pending={pending}
          error={fieldErrors.newPassword}
          onChange={() => clearField("newPassword")}
        />
        <PasswordField
          id="confirmPassword"
          label="Confirm new password"
          autoComplete="new-password"
          pending={pending}
          error={fieldErrors.confirmPassword}
          onChange={() => clearField("confirmPassword")}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="signOutOthers"
            defaultChecked
            disabled={pending}
          />
          Sign out of other devices
        </label>
        <FieldError>{error}</FieldError>
        {saved ? (
          <p className="text-sm text-foreground" role="status">
            {hasPassword ? "Password changed." : "Password set."}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : hasPassword
              ? "Change password"
              : "Set password"}
        </Button>
      </form>
    </section>
  );
}

export function PasswordField({
  id,
  label,
  autoComplete,
  hint,
  pending,
  error,
  onChange,
}: {
  id: string;
  label: string;
  autoComplete: string;
  hint?: string;
  pending: boolean;
  error?: string;
  onChange: () => void;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div>
      <Label htmlFor={id} required>
        {label}
      </Label>
      <Input
        id={id}
        name={id}
        type="password"
        autoComplete={autoComplete}
        disabled={pending}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        onChange={onChange}
      />
      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
