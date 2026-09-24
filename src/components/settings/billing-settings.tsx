"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelSubscriptionAtPeriodEnd,
  createPaymentMethodPortalSession,
  resumeSubscription,
  selectBillingPlan,
} from "@/actions/billing";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BillingPageData } from "@/lib/billing/queries";
import { formatCatalogPounds } from "@/lib/billing/catalog-format";
import { formatGBP } from "@/lib/money";
import { toast } from "@/components/ui/toast";

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

function brandLabel(brand: string): string {
  if (!brand) return "Card";
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

export function BillingSettingsPanel({ data }: { data: BillingPageData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const {
    entitlements: e,
    userCount,
    stripeConfigured,
    billingInterval,
    catalog,
    stripeSubscriptionId,
    paymentMethod,
    invoices,
    stripeCustomerId,
  } = data;
  const maxLabel =
    e.maxUsers === 0 ? "Unlimited" : `${userCount} / ${e.maxUsers}`;

  const hasActiveSubscription =
    Boolean(stripeSubscriptionId) &&
    e.status !== "canceled" &&
    e.status !== "unpaid";

  const showManageSections =
    stripeConfigured && Boolean(stripeCustomerId) && !e.complimentary;

  const plans = (
    [
      {
        plan: "essentials" as const,
        name: catalog?.essentials.name ?? "Essentials",
        month: catalog
          ? formatCatalogPounds(catalog.essentials.month.amountPence)
          : null,
        year: catalog
          ? formatCatalogPounds(catalog.essentials.year.amountPence)
          : null,
      },
      {
        plan: "premium" as const,
        name: catalog?.premium.name ?? "Premium",
        month: catalog
          ? formatCatalogPounds(catalog.premium.month.amountPence)
          : null,
        year: catalog
          ? formatCatalogPounds(catalog.premium.year.amountPence)
          : null,
      },
    ] as const
  );

  function isCurrentSku(
    plan: "essentials" | "premium",
    interval: "month" | "year",
  ): boolean {
    return (
      hasActiveSubscription &&
      e.plan === plan &&
      billingInterval === interval
    );
  }

  function onSelectPlan(formData: FormData) {
    start(async () => {
      try {
        const result = await selectBillingPlan(formData);
        if (result.ok) {
          toast("Plan updated.");
          router.refresh();
          return;
        }
        toast(result.error);
      } catch (err) {
        const { isRedirectError } = await import(
          "next/dist/client/components/redirect-error"
        );
        if (isRedirectError(err)) throw err;
        toast(
          err instanceof Error ? err.message : "Could not update your plan.",
        );
      }
    });
  }

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
      </section>

      {!e.complimentary ? (
        <section className="rounded-2xl border border-border bg-white p-6">
          <h2 className="font-display text-lg font-semibold">
            {e.plan === "trial" || e.readOnly || !hasActiveSubscription
              ? "Choose a plan"
              : "Change plan"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Prices are ex VAT. Annual plans include two months free.
            {hasActiveSubscription
              ? " Upgrades and downgrades are prorated."
              : null}
          </p>
          {!stripeConfigured ? (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Billing checkout is not configured yet. Contact support to upgrade.
            </p>
          ) : !catalog ? (
            <p className="mt-4 text-sm text-muted">
              Pricing temporarily unavailable. Try again shortly.
            </p>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {plans.map((p) => (
                <div
                  key={p.plan}
                  className={cn(
                    "rounded-xl border bg-wash/40 p-4",
                    e.plan === p.plan && hasActiveSubscription
                      ? "border-navy ring-1 ring-navy/30"
                      : "border-border",
                  )}
                >
                  <h3 className="font-display text-base font-semibold">
                    {p.name}
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    {p.month}/mo or {p.year}/yr
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(["month", "year"] as const).map((interval) => {
                      const current = isCurrentSku(p.plan, interval);
                      return (
                        <form
                          key={interval}
                          action={(fd) => {
                            onSelectPlan(fd);
                          }}
                        >
                          <input type="hidden" name="plan" value={p.plan} />
                          <input
                            type="hidden"
                            name="interval"
                            value={interval}
                          />
                          <button
                            type="submit"
                            disabled={pending || current}
                            className={cn(
                              buttonClasses(
                                interval === "month" ? "primary" : "secondary",
                                "px-4 py-1.5 text-xs",
                              ),
                            )}
                          >
                            {current
                              ? "Current"
                              : interval === "month"
                                ? "Monthly"
                                : "Yearly"}
                          </button>
                        </form>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {showManageSections ? (
        <section className="rounded-2xl border border-border bg-white p-6">
          <h2 className="font-display text-lg font-semibold">Payment method</h2>
          <p className="mt-1 text-sm text-muted">
            Used for subscription renewals and prorated plan changes.
          </p>
          {paymentMethod ? (
            <p className="mt-4 text-sm font-medium">
              {brandLabel(paymentMethod.brand)} ···· {paymentMethod.last4}
              <span className="ml-2 font-normal text-muted">
                Expires {String(paymentMethod.expMonth).padStart(2, "0")}/
                {paymentMethod.expYear}
              </span>
            </p>
          ) : (
            <p className="mt-4 text-sm text-muted">No card on file.</p>
          )}
          <button
            type="button"
            disabled={pending}
            className={cn(buttonClasses("secondary", "mt-4 px-4 py-1.5 text-sm"))}
            onClick={() => {
              start(async () => {
                try {
                  const result = await createPaymentMethodPortalSession();
                  // redirect() never returns; only errors reach here.
                  if (!result.ok) toast(result.error);
                } catch (err) {
                  const { isRedirectError } = await import(
                    "next/dist/client/components/redirect-error"
                  );
                  if (isRedirectError(err)) throw err;
                  toast(
                    err instanceof Error
                      ? err.message
                      : "Could not open Stripe.",
                  );
                }
              });
            }}
          >
            Update card on Stripe
          </button>
        </section>
      ) : null}

      {showManageSections ? (
        <section className="rounded-2xl border border-border bg-white p-6">
          <h2 className="font-display text-lg font-semibold">Invoices</h2>
          {invoices.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No invoices yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {invoices.map((inv) => {
                const amount =
                  inv.status === "paid" ? inv.amountPaid : inv.amountDue;
                const date = new Date(inv.created * 1000).toLocaleDateString(
                  "en-GB",
                  { day: "numeric", month: "short", year: "numeric" },
                );
                const href = inv.hostedInvoiceUrl ?? inv.invoicePdf;
                return (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {inv.number ?? inv.id}
                        <span className="ml-2 font-normal capitalize text-muted">
                          {inv.status ?? "unknown"}
                        </span>
                      </p>
                      <p className="text-muted">{date}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{formatGBP(amount)}</span>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand underline-offset-2 hover:underline"
                        >
                          View
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {showManageSections && hasActiveSubscription ? (
        <section className="rounded-2xl border border-border bg-white p-6">
          <h2 className="font-display text-lg font-semibold">
            Cancel subscription
          </h2>
          {e.cancelAtPeriodEnd ? (
            <>
              <p className="mt-1 text-sm text-muted">
                Your plan stays active until{" "}
                {e.currentPeriodEnd
                  ? e.currentPeriodEnd.toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "the end of the billing period"}
                . You can keep the subscription to resume billing.
              </p>
              <button
                type="button"
                disabled={pending}
                className={cn(buttonClasses("primary", "mt-4 px-4 py-1.5 text-sm"))}
                onClick={() => {
                  start(async () => {
                    const result = await resumeSubscription();
                    if (result.ok) {
                      toast("Subscription resumed.");
                      router.refresh();
                    } else {
                      toast(result.error);
                    }
                  });
                }}
              >
                Keep subscription
              </button>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">
                Cancel at the end of the current billing period. You keep access
                until then.
              </p>
              {!confirmCancel ? (
                <button
                  type="button"
                  disabled={pending}
                  className={cn(
                    buttonClasses("destructive", "mt-4 px-4 py-1.5 text-sm"),
                  )}
                  onClick={() => setConfirmCancel(true)}
                >
                  Cancel at period end
                </button>
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    className={cn(
                      buttonClasses("destructive", "px-4 py-1.5 text-sm"),
                    )}
                    onClick={() => {
                      start(async () => {
                        const result = await cancelSubscriptionAtPeriodEnd();
                        setConfirmCancel(false);
                        if (result.ok) {
                          toast("Cancellation scheduled.");
                          router.refresh();
                        } else {
                          toast(result.error);
                        }
                      });
                    }}
                  >
                    Confirm cancel
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    className={cn(buttonClasses("ghost", "px-4 py-1.5 text-sm"))}
                    onClick={() => setConfirmCancel(false)}
                  >
                    Never mind
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
