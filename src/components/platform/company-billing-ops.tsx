"use client";

import { useRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  extendCompanyTrial,
  grantComplimentaryAccess,
  revokeComplimentaryAccess,
} from "@/actions/platform";
import { buttonClasses } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/toast";
import { StatusPill } from "@/components/platform/status-pill";
import { formatDateTimeUk } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/actions/result";

function StripeId({ id, href }: { id: string | null; href: string | null }) {
  if (!id) return <dd className="font-mono text-xs">—</dd>;
  return (
    <dd className="font-mono text-xs">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-navy hover:underline"
        >
          {id} ↗
        </a>
      ) : (
        id
      )}
    </dd>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      {children}
    </div>
  );
}

export function CompanyBillingOpsForm({
  companyId,
  complimentary,
  plan,
  status,
  trialEndsAt,
  currentPeriodEnd,
  stripeCustomerId,
  stripeSubscriptionId,
  stripeCustomerUrl,
  stripeSubscriptionUrl,
  complimentaryNote,
  complimentaryExpiresAt,
  readOnly,
}: {
  companyId: string;
  complimentary: boolean;
  plan: string;
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCustomerUrl: string | null;
  stripeSubscriptionUrl: string | null;
  complimentaryNote: string | null;
  complimentaryExpiresAt: Date | null;
  readOnly: boolean;
}) {
  const router = useRouter();
  const { confirm, alert } = useAlert();
  const [pending, start] = useTransition();
  const grantRef = useRef<HTMLFormElement>(null);
  const paid = status === "active" || status === "past_due";

  function run(action: () => Promise<ActionResult>, success: string, after?: () => void) {
    start(async () => {
      const result = await action();
      if (result.ok) {
        toast(success);
        after?.();
        router.refresh();
      } else {
        void alert({ title: "Billing change failed", message: result.error });
      }
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-white p-5">
      <h2 className="font-display text-lg font-semibold">Billing</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <Row label="Plan">
          <dd className="capitalize">{plan}</dd>
        </Row>
        <Row label="Status">
          <dd className="flex items-center gap-2">
            {readOnly ? <StatusPill status="read_only" label="Read-only" tone="danger" /> : null}
            <StatusPill status={status} />
          </dd>
        </Row>
        {complimentary ? (
          <Row label="Access">
            <dd>
              <StatusPill status="complimentary" label="Complimentary unlimited" />
            </dd>
          </Row>
        ) : null}
        {trialEndsAt ? (
          <Row label="Trial ends">
            <dd>{formatDateTimeUk(trialEndsAt)}</dd>
          </Row>
        ) : null}
        {currentPeriodEnd ? (
          <Row label="Period end">
            <dd>{formatDateTimeUk(currentPeriodEnd)}</dd>
          </Row>
        ) : null}
        <Row label="Stripe customer">
          <StripeId id={stripeCustomerId} href={stripeCustomerUrl} />
        </Row>
        <Row label="Stripe subscription">
          <StripeId id={stripeSubscriptionId} href={stripeSubscriptionUrl} />
        </Row>
        {complimentaryNote ? (
          <div>
            <dt className="text-muted">Comp note</dt>
            <dd className="mt-1">{complimentaryNote}</dd>
          </div>
        ) : null}
        {complimentaryExpiresAt ? (
          <Row label="Comp expires">
            <dd>{formatDateTimeUk(complimentaryExpiresAt)}</dd>
          </Row>
        ) : null}
      </dl>

      <div className="mt-6 space-y-4 border-t border-border pt-4">
        {complimentary ? (
          <div>
            <p className="mb-2 text-sm text-muted">
              Complimentary unlimited overrides paid plan checks until revoked.
            </p>
            <button
              type="button"
              disabled={pending}
              className={cn(buttonClasses("destructive"))}
              onClick={async () => {
                const ok = await confirm({
                  title: "Revoke complimentary access?",
                  message:
                    "The company returns to its normal plan limits straight away. If its trial has ended and it has no subscription, it becomes read-only.",
                  confirmLabel: "Revoke access",
                  variant: "destructive",
                });
                if (ok) {
                  run(() => revokeComplimentaryAccess(companyId), "Complimentary access revoked.");
                }
              }}
            >
              Revoke complimentary
            </button>
          </div>
        ) : (
          <form
            ref={grantRef}
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              run(
                () => grantComplimentaryAccess(fd),
                "Complimentary access granted.",
                () => grantRef.current?.reset(),
              );
            }}
          >
            <input type="hidden" name="companyId" value={companyId} />
            <p className="text-sm text-muted">
              Grant free unlimited access (bypasses all plan limits). Does not
              create a Stripe subscription.
            </p>
            <label className="block text-sm">
              <span className="text-muted">Note</span>
              <input
                name="note"
                className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                placeholder="Optional reason"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted">Expires (optional)</span>
              <input
                type="date"
                name="expiresAt"
                className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className={cn(buttonClasses("primary"))}
            >
              Grant complimentary unlimited
            </button>
          </form>
        )}

        {paid ? (
          <p className="text-sm text-muted">
            Trials can&apos;t be extended while the company has a paid
            subscription. Grant complimentary access instead.
          </p>
        ) : (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              run(() => extendCompanyTrial(fd), `Trial extended by ${fd.get("days")} days.`);
            }}
          >
            <input type="hidden" name="companyId" value={companyId} />
            <label className="text-sm">
              <span className="text-muted">Extend trial (days)</span>
              <input
                type="number"
                name="days"
                min={1}
                max={90}
                defaultValue={7}
                className="mt-1 w-24 rounded-lg border border-border px-3 py-2"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className={cn(buttonClasses("secondary"))}
            >
              Extend trial
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
