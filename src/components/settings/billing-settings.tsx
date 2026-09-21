"use client";

import { useTransition } from "react";
import {
  createCheckoutSession,
  createCustomerPortalSession,
} from "@/actions/billing";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BillingPageData } from "@/lib/billing/queries";

function planLabel(plan: string): string {
  switch (plan) {
    case "essentials":
      return "Essentials";
    case "premium":
      return "Premium";
    case "trial":
      return "Trial";
    default:
      return plan;
  }
}

export function BillingSettingsPanel({ data }: { data: BillingPageData }) {
  const [pending, start] = useTransition();
  const { entitlements: e, userCount, stripeConfigured, billingInterval } = data;
  const maxLabel =
    e.maxUsers === 0 ? "Unlimited" : `${userCount} / ${e.maxUsers}`;

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-white p-6">
        <h2 className="font-display text-lg font-semibold">Current plan</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Plan</dt>
            <dd className="font-medium">
              {e.complimentary
                ? "Complimentary unlimited"
                : planLabel(e.plan)}
              {billingInterval ? ` · billed ${billingInterval}ly` : null}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Status</dt>
            <dd className="font-medium capitalize">
              {e.readOnly ? "Read-only" : e.status.replace("_", " ")}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Users</dt>
            <dd className="font-medium">{maxLabel}</dd>
          </div>
          <div>
            <dt className="text-muted">VAT export</dt>
            <dd className="font-medium">{e.vatExport ? "Included" : "Not included"}</dd>
          </div>
          {e.trialEndsAt && e.status === "trialing" ? (
            <div>
              <dt className="text-muted">Trial ends</dt>
              <dd className="font-medium">
                {e.trialEndsAt.toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </dd>
            </div>
          ) : null}
          {e.currentPeriodEnd ? (
            <div>
              <dt className="text-muted">
                {e.cancelAtPeriodEnd ? "Access until" : "Renews"}
              </dt>
              <dd className="font-medium">
                {e.currentPeriodEnd.toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </dd>
            </div>
          ) : null}
        </dl>

        {stripeConfigured && data.stripeCustomerId ? (
          <form
            className="mt-6"
            action={() => {
              start(async () => {
                await createCustomerPortalSession();
              });
            }}
          >
            <button
              type="submit"
              disabled={pending}
              className={cn(buttonClasses("secondary"))}
            >
              Manage billing
            </button>
          </form>
        ) : null}
      </section>

      {!e.complimentary ? (
        <section className="rounded-2xl border border-border bg-white p-6">
          <h2 className="font-display text-lg font-semibold">
            {e.plan === "trial" || e.readOnly ? "Choose a plan" : "Change plan"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Prices are ex VAT. Annual plans include two months free.
          </p>
          {!stripeConfigured ? (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Billing checkout is not configured yet. Contact support to upgrade.
            </p>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {(
                [
                  {
                    plan: "essentials" as const,
                    name: "Essentials",
                    month: "£19",
                    year: "£190",
                  },
                  {
                    plan: "premium" as const,
                    name: "Premium",
                    month: "£29",
                    year: "£290",
                  },
                ] as const
              ).map((p) => (
                <div
                  key={p.plan}
                  className="rounded-xl border border-border bg-wash/40 p-4"
                >
                  <h3 className="font-display text-base font-semibold">
                    {p.name}
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    {p.month}/mo or {p.year}/yr
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <form
                      action={(fd) => {
                        start(async () => {
                          await createCheckoutSession(fd);
                        });
                      }}
                    >
                      <input type="hidden" name="plan" value={p.plan} />
                      <input type="hidden" name="interval" value="month" />
                      <button
                        type="submit"
                        disabled={pending}
                        className={cn(buttonClasses("primary", "px-4 py-1.5 text-xs"))}
                      >
                        Monthly
                      </button>
                    </form>
                    <form
                      action={(fd) => {
                        start(async () => {
                          await createCheckoutSession(fd);
                        });
                      }}
                    >
                      <input type="hidden" name="plan" value={p.plan} />
                      <input type="hidden" name="interval" value="year" />
                      <button
                        type="submit"
                        disabled={pending}
                        className={cn(
                          buttonClasses("secondary", "px-4 py-1.5 text-xs"),
                        )}
                      >
                        Yearly
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
