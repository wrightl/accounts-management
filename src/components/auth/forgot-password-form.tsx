"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import { Button, buttonClasses } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { PasswordField } from "@/components/users/password-section";
import {
  clerkErrorMessage,
  isIdentifierNotFound,
  parsePasswordReset,
  parseResetEmail,
  PASSWORD_MIN_LENGTH,
} from "@/lib/password/schema";

type Step = "email" | "reset" | "sign-in";

/** Same message for a wrong code and an unknown email, so neither leaks. */
const BAD_CODE = "That code is not right or has expired";

/**
 * Forgot password flow: email a reset code, then take the code and a new
 * password. Signs the user in when Clerk needs nothing more.
 */
export function ForgotPasswordForm() {
  const router = useRouter();
  const { signIn } = useSignIn();
  const { fieldErrors, error, setError, clearAll, clearField, applyFail } =
    useFieldErrors();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [resent, setResent] = useState(false);
  // False when no account uses the email. The page acts as if a code was
  // sent anyway, so it cannot be used to find out who has an account.
  const [accountFound, setAccountFound] = useState(false);

  async function sendCode(address: string): Promise<boolean> {
    const created = await signIn.create({ identifier: address });
    if (created.error) {
      if (isIdentifierNotFound(created.error)) {
        setAccountFound(false);
        return true;
      }
      setError(clerkErrorMessage(created.error, "We could not send a reset code"));
      return false;
    }
    const sent = await signIn.resetPasswordEmailCode.sendCode();
    if (sent.error) {
      setError(clerkErrorMessage(sent.error, "We could not send a reset code"));
      return false;
    }
    setAccountFound(true);
    return true;
  }

  async function onEmailSubmit(formData: FormData) {
    clearAll();
    const parsed = parseResetEmail(formData);
    if (!parsed.ok) {
      applyFail(parsed);
      scheduleFocusFirstFieldError(formRef.current, parsed.fieldErrors);
      return;
    }
    setPending(true);
    try {
      if (await sendCode(parsed.data.email)) {
        setEmail(parsed.data.email);
        setStep("reset");
      }
    } finally {
      setPending(false);
    }
  }

  async function onResend() {
    clearAll();
    setResent(false);
    setPending(true);
    try {
      if (await sendCode(email)) setResent(true);
    } finally {
      setPending(false);
    }
  }

  async function onResetSubmit(formData: FormData) {
    clearAll();
    setResent(false);
    const parsed = parsePasswordReset(formData);
    if (!parsed.ok) {
      applyFail(parsed);
      scheduleFocusFirstFieldError(formRef.current, parsed.fieldErrors);
      return;
    }
    setPending(true);
    try {
      if (!accountFound) {
        applyFail({ error: BAD_CODE, fieldErrors: { code: BAD_CODE } });
        scheduleFocusFirstFieldError(formRef.current, { code: BAD_CODE });
        return;
      }
      // A rejected password leaves the code verified, so skip it on retry.
      if (signIn.status !== "needs_new_password") {
        const verified = await signIn.resetPasswordEmailCode.verifyCode({
          code: parsed.data.code,
        });
        if (verified.error) {
          applyFail({ error: BAD_CODE, fieldErrors: { code: BAD_CODE } });
          scheduleFocusFirstFieldError(formRef.current, { code: BAD_CODE });
          return;
        }
      }
      const submitted = await signIn.resetPasswordEmailCode.submitPassword({
        password: parsed.data.newPassword,
        signOutOfOtherSessions: true,
      });
      if (submitted.error) {
        const message = clerkErrorMessage(
          submitted.error,
          "That password could not be used",
        );
        applyFail({ error: message, fieldErrors: { newPassword: message } });
        scheduleFocusFirstFieldError(formRef.current, { newPassword: message });
        return;
      }
      if (signIn.status !== "complete") {
        // For example a second factor is needed: finish on the sign-in page.
        setStep("sign-in");
        return;
      }
      const finalized = await signIn.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl("/dashboard");
          if (url.startsWith("http")) window.location.href = url;
          else router.push(url);
        },
      });
      if (finalized.error) setStep("sign-in");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-surface p-8 text-foreground shadow-xl">
      <h1 className="font-display text-xl font-semibold">Reset your password</h1>

      {step === "email" ? (
        <form
          ref={formRef}
          noValidate
          onSubmit={preventResetSubmit(onEmailSubmit)}
          className="mt-6 space-y-4"
        >
          <p className="text-sm text-muted">
            Enter the email you sign in with and we will send you a code to
            reset your password.
          </p>
          <div>
            <Label htmlFor="email" required>
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={email}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              onChange={() => clearField("email")}
            />
            <FieldError id="email-error">{fieldErrors.email}</FieldError>
          </div>
          {error && !fieldErrors.email ? <FieldError>{error}</FieldError> : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Sending…" : "Send reset code"}
          </Button>
        </form>
      ) : null}

      {step === "reset" ? (
        <form
          ref={formRef}
          noValidate
          onSubmit={preventResetSubmit(onResetSubmit)}
          className="mt-6 space-y-4"
        >
          <p className="text-sm text-muted">
            If <strong>{email}</strong> has an account, we have sent it a 6
            digit code. Enter the code below with your new password.
          </p>
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={email}
            readOnly
            hidden
          />
          <div>
            <Label htmlFor="code" required>
              Reset code
            </Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.code)}
              aria-describedby={fieldErrors.code ? "code-error" : undefined}
              onChange={() => clearField("code")}
            />
            <FieldError id="code-error">{fieldErrors.code}</FieldError>
          </div>
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
          {error && Object.keys(fieldErrors).length === 0 ? (
            <FieldError>{error}</FieldError>
          ) : null}
          {resent ? (
            <p className="text-sm" role="status">
              If the email has an account, we have sent a new code.
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Reset password"}
          </Button>
          <div className="flex justify-between text-sm">
            <button
              type="button"
              className="text-accent underline"
              disabled={pending}
              onClick={onResend}
            >
              Send a new code
            </button>
            <button
              type="button"
              className="text-accent underline"
              disabled={pending}
              onClick={async () => {
                clearAll();
                await signIn.reset();
                setStep("email");
              }}
            >
              Use a different email
            </button>
          </div>
        </form>
      ) : null}

      {step === "sign-in" ? (
        <div className="mt-6 space-y-4">
          <p className="text-sm" role="status">
            Your password has been reset. Sign in with your new password to
            continue.
          </p>
          <Link href="/sign-in" className={buttonClasses("primary", "w-full")}>
            Go to sign in
          </Link>
        </div>
      ) : null}

      {step !== "sign-in" ? (
        <p className="mt-6 text-center text-sm text-muted">
          Remembered it?{" "}
          <Link href="/sign-in" className="text-accent underline">
            Back to sign in
          </Link>
        </p>
      ) : null}
    </div>
  );
}
