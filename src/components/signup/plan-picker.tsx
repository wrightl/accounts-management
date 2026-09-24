"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { saveSignupPlanChoice } from "@/actions/signup-plan";
import { Button, buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCatalogPounds } from "@/lib/billing/catalog-format";
import type { StripeCatalog } from "@/lib/billing/catalog-types";
import type { PricingPlan } from "@/lib/marketing-analytics";
import type { SignupPlanChoice } from "@/lib/signup-plan";

type Interval = "month" | "year";

type PlanCard = {
  id: PricingPlan;
  name: string;
  price: string;
  priceNote: string;
  description: string;
  featured?: boolean;
  features: string[];
};

function buildCards(catalog: StripeCatalog | null): PlanCard[] {
  const essentialsMonth = catalog
    ? formatCatalogPounds(catalog.essentials.month.amountPence)
    : null;
  const essentialsYear = catalog
    ? formatCatalogPounds(catalog.essentials.year.amountPence)
    : null;
  const premiumMonth = catalog
    ? formatCatalogPounds(catalog.premium.month.amountPence)
    : null;
  const premiumYear = catalog
    ? formatCatalogPounds(catalog.premium.year.amountPence)
    : null;

  return [
    {
      id: "trial",
      name: "Trial",
      price: "£0",
      priceNote: "30 days",
      description: "Try the full weekly rhythm before you pick a paid plan.",
      features: [
        "Core books — quotes, invoices, expenses, reports",
        "Recurring invoices",
        "Up to 5 users",
        "All multi-bank CSV providers",
        "VAT summary only (no export)",
      ],
    },
    {
      id: "essentials",
      name: catalog?.essentials.name ?? "Essentials",
      price: essentialsMonth ?? "—",
      priceNote: essentialsYear
        ? `/ org / mo · or ${essentialsYear} / year`
        : "Pricing temporarily unavailable",
      description:
        catalog?.essentials.description ??
        "Default paid plan for 1–3 person consultancies and studios.",
      featured: true,
      features: [
        "Everything in Trial",
        "VAT rates + VAT export",
        "Up to 5 users",
        "All multi-bank CSV providers",
        "Accountant pack",
      ],
    },
    {
      id: "premium",
      name: catalog?.premium.name ?? "Premium",
      price: premiumMonth ?? "—",
      priceNote: premiumYear
        ? `/ org / mo · or ${premiumYear} / year`
        : "Pricing temporarily unavailable",
      description:
        catalog?.premium.description ??
        "Higher user limits and earlier access to upcoming extras.",
      features: [
        "Everything in Essentials",
        "Up to 15 users",
        "Priority support / early features",
      ],
    },
  ];
}

export function SignupPlanPicker({
  catalog,
  initialPlan,
  onConfirmed,
  title = "Choose your plan",
  subtitle = "Pick a tier to continue. Paid plans include a 30-day free trial — card required, charged after the trial.",
  tone = "dark",
}: {
  catalog: StripeCatalog | null;
  initialPlan: PricingPlan | null;
  onConfirmed: (choice: SignupPlanChoice) => void;
  title?: string;
  subtitle?: string;
  /** dark = white text on navy auth frame; light = onboarding canvas */
  tone?: "dark" | "light";
}) {
  const cards = buildCards(catalog);
  const [plan, setPlan] = useState<PricingPlan | null>(initialPlan);
  const [interval, setInterval] = useState<Interval>("month");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onContinue() {
    setError(null);
    if (!plan) {
      setError("Choose a subscription tier to continue.");
      return;
    }
    const choice: SignupPlanChoice =
      plan === "trial" ? { plan: "trial" } : { plan, interval };

    startTransition(async () => {
      const fd = new FormData();
      fd.set("plan", choice.plan);
      if (choice.plan !== "trial") {
        fd.set("interval", choice.interval);
      }
      const result = await saveSignupPlanChoice(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onConfirmed(choice);
    });
  }

  const dark = tone === "dark";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className={cn("text-center", dark ? "text-white" : "text-foreground")}>
        <h1 className="font-display text-2xl font-semibold md:text-3xl">
          {title}
        </h1>
        <p
          className={cn(
            "mt-2 text-sm",
            dark ? "text-white/75" : "text-muted",
          )}
        >
          {subtitle}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => {
          const selected = plan === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setPlan(card.id)}
              disabled={pending}
              aria-pressed={selected}
              className={cn(
                "flex flex-col rounded-2xl border bg-white p-5 text-left transition",
                selected
                  ? "border-brand ring-2 ring-brand shadow-lg"
                  : "border-border hover:border-navy/40",
                card.featured && !selected ? "ring-1 ring-navy/20" : null,
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-xl font-semibold text-navy">
                  {card.name}
                </h2>
                {selected ? (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand text-brand-foreground">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </span>
                ) : null}
              </div>
              <div className="mt-3">
                <span className="font-display text-3xl font-normal text-navy">
                  {card.price}
                </span>
                <p className="mt-1 text-xs text-muted">{card.priceNote}</p>
              </div>
              <p className="mt-3 text-sm text-muted">{card.description}</p>
              <ul className="mt-4 space-y-2">
                {card.features.map((f) => (
                  <li
                    key={f}
                    className="flex gap-2 text-xs text-foreground/90"
                  >
                    <Check
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success"
                      aria-hidden
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {plan === "essentials" || plan === "premium" ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span
            className={cn(
              "text-sm",
              dark ? "text-white/80" : "text-muted",
            )}
          >
            Billing:
          </span>
          {(
            [
              ["month", "Monthly"],
              ["year", "Yearly (2 months free)"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={pending}
              onClick={() => setInterval(value)}
              className={cn(
                buttonClasses(
                  interval === value ? "primary" : "ghost",
                  cn(
                    "px-4 py-1.5 text-sm",
                    dark
                      ? "border border-white/30"
                      : "border border-border",
                  ),
                ),
                interval !== value && dark
                  ? "text-white hover:bg-white/10"
                  : null,
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <p
          className={cn(
            "text-center text-sm",
            dark ? "text-red-200" : "text-red-700",
          )}
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex justify-center">
        <Button
          type="button"
          onClick={onContinue}
          disabled={pending || !plan}
          className="min-w-[12rem] px-8 py-2.5"
        >
          {pending ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
