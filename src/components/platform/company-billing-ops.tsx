"use client";

import { useTransition } from "react";
import {
  extendCompanyTrial,
  grantComplimentaryAccess,
  revokeComplimentaryAccess,
} from "@/actions/platform";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CompanyBillingOpsForm({
  companyId,
  complimentary,
  plan,
  status,
  trialEndsAt,
  currentPeriodEnd,
  stripeCustomerId,
  stripeSubscriptionId,
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
  complimentaryNote: string | null;
  complimentaryExpiresAt: Date | null;
  readOnly: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <section className="rounded-2xl border border-border bg-white p-5">
      <h2 className="font-display text-lg font-semibold">Billing</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Plan</dt>
          <dd className="capitalize">{plan}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Status</dt>
          <dd>
            {readOnly ? "Read-only · " : ""}
            <span className="capitalize">{status.replace("_", " ")}</span>
          </dd>
        </div>
        {complimentary ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Access</dt>
            <dd className="text-green-800">Complimentary unlimited</dd>
          </div>
        ) : null}
        {trialEndsAt ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Trial ends</dt>
            <dd>{trialEndsAt.toLocaleString("en-GB")}</dd>
          </div>
        ) : null}
        {currentPeriodEnd ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Period end</dt>
            <dd>{currentPeriodEnd.toLocaleString("en-GB")}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Stripe customer</dt>
          <dd className="font-mono text-xs">{stripeCustomerId ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Stripe subscription</dt>
          <dd className="font-mono text-xs">{stripeSubscriptionId ?? "—"}</dd>
        </div>
        {complimentaryNote ? (
          <div>
            <dt className="text-muted">Comp note</dt>
            <dd className="mt-1">{complimentaryNote}</dd>
          </div>
        ) : null}
        {complimentaryExpiresAt ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Comp expires</dt>
            <dd>{complimentaryExpiresAt.toLocaleString("en-GB")}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-6 space-y-4 border-t border-border pt-4">
        {complimentary ? (
          <form
            action={() => {
              start(async () => {
                await revokeComplimentaryAccess(companyId);
              });
            }}
          >
            <p className="mb-2 text-sm text-muted">
              Complimentary unlimited overrides paid plan checks until revoked.
            </p>
            <button
              type="submit"
              disabled={pending}
              className={cn(buttonClasses("destructive"))}
            >
              Revoke complimentary
            </button>
          </form>
        ) : (
          <form
            className="space-y-3"
            action={(fd) => {
              start(async () => {
                await grantComplimentaryAccess(fd);
              });
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

        <form
          className="flex flex-wrap items-end gap-2"
          action={(fd) => {
            start(async () => {
              await extendCompanyTrial(fd);
            });
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
      </div>
    </section>
  );
}
