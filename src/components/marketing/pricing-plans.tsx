import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Plan = {
  name: string;
  price: string;
  priceNote: string;
  description: string;
  featured?: boolean;
  features: string[];
};

const PLANS: Plan[] = [
  {
    name: "Trial",
    price: "£0",
    priceNote: "30 days",
    description: "Try the full weekly rhythm before you pick a paid plan.",
    features: [
      "Core books — quotes, invoices, expenses, reports",
      "Recurring invoices",
      "Up to 3 users (founders + accountant)",
      "All multi-bank CSV providers",
      "VAT summary only (no export)",
    ],
  },
  {
    name: "Essentials",
    price: "£19",
    priceNote: "/ org / mo · or £190 / year (2 months free)",
    description: "Default paid plan for 1–3 person consultancies and studios.",
    featured: true,
    features: [
      "Everything in Trial",
      "VAT rates + VAT export for your accountant",
      "Up to 3 users",
      "All multi-bank CSV providers",
      "Accountant pack",
    ],
  },
  {
    name: "Premium",
    price: "£29",
    priceNote: "/ org / mo · or £290 / year (2 months free)",
    description: "Higher user limits and earlier access to upcoming extras.",
    features: [
      "Everything in Essentials",
      "Up to 15 users",
      "Priority support / early features",
      "Live bank feed — future (not included yet)",
    ],
  },
];

type Cell = "yes" | "no" | string;

type CompareRow = {
  label: string;
  trial: Cell;
  essentials: Cell;
  premium: Cell;
};

const COMPARE_ROWS: CompareRow[] = [
  {
    label: "Core books",
    trial: "yes",
    essentials: "yes",
    premium: "yes",
  },
  {
    label: "Recurring invoices",
    trial: "yes",
    essentials: "yes",
    premium: "yes",
  },
  {
    label: "Users",
    trial: "Up to 3",
    essentials: "Up to 3",
    premium: "Up to 15",
  },
  {
    label: "Multi-bank CSV",
    trial: "yes",
    essentials: "yes",
    premium: "yes",
  },
  {
    label: "VAT rates + export",
    trial: "Summary only",
    essentials: "yes",
    premium: "yes",
  },
  {
    label: "Live bank feed",
    trial: "no",
    essentials: "no",
    premium: "Future",
  },
  {
    label: "Priority support / early features",
    trial: "no",
    essentials: "no",
    premium: "yes",
  },
];

function CompareCell({ value, featured }: { value: Cell; featured?: boolean }) {
  if (value === "yes") {
    return (
      <Check
        className={cn(
          "mx-auto h-5 w-5",
          featured ? "text-navy" : "text-success",
        )}
        aria-label="Included"
      />
    );
  }
  if (value === "no") {
    return (
      <Minus
        className="mx-auto h-5 w-5 text-muted/50"
        aria-label="Not included"
      />
    );
  }
  return (
    <span
      className={cn(
        "text-sm",
        featured ? "font-medium text-navy" : "text-foreground/90",
      )}
    >
      {value}
    </span>
  );
}

export function PricingPlans() {
  return (
    <section className="bg-wash px-6 py-16 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="font-display text-3xl font-normal tracking-tight md:text-4xl">
            Simple plans, honest limits
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            Prices exclude VAT. Pay yearly and get two months free. Choose a
            paid plan before the trial ends — card billing follows when you
            convert.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3 md:items-stretch">
          {PLANS.map((plan) => (
            <article
              key={plan.name}
              className={cn(
                "flex flex-col rounded-2xl border bg-white p-6 md:p-8",
                plan.featured
                  ? "border-navy shadow-lg shadow-navy/10 ring-2 ring-navy md:-my-2 md:py-10"
                  : "border-border",
              )}
            >
              {plan.featured ? (
                <p className="mb-3 text-xs font-medium tracking-widest text-navy uppercase">
                  Most popular
                </p>
              ) : (
                <p
                  className="mb-3 text-xs tracking-widest text-transparent uppercase select-none"
                  aria-hidden
                >
                  &nbsp;
                </p>
              )}
              <h3 className="font-display text-2xl font-semibold text-navy">
                {plan.name}
              </h3>
              <div className="mt-4">
                <span className="font-display text-4xl font-normal tracking-tight text-navy">
                  {plan.price}
                </span>
                <p className="mt-1 text-sm text-muted">{plan.priceNote}</p>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted">
                {plan.description}
              </p>
              <ul className="mt-6 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex gap-3 text-sm text-foreground/90"
                  >
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-success"
                      aria-hidden
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up"
                className={buttonClasses(
                  plan.featured ? "primary" : "secondary",
                  "mt-8 w-full px-6 py-2.5",
                )}
              >
                Start free trial
              </Link>
            </article>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-3xl text-center text-sm text-muted">
          VAT export helps your accountant — it is not HMRC filing. Bank import
          is CSV today, not a live feed. GBP only. Per organisation, not per
          seat.
        </p>

        <div id="compare" className="mt-16 scroll-mt-24">
          <h3 className="text-center font-display text-2xl font-normal tracking-tight md:text-3xl">
            Compare plans
          </h3>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-muted">
            What each tier includes today. Live bank feed is planned for
            Premium — it is not included yet.
          </p>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-border bg-white">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-4 pr-4 pl-5 text-left font-semibold text-foreground">
                    Capability
                  </th>
                  <th className="px-4 py-4 text-center font-semibold text-foreground">
                    Trial
                  </th>
                  <th className="bg-wash/60 px-4 py-4 text-center font-semibold text-navy">
                    Essentials
                  </th>
                  <th className="px-4 py-4 pr-5 text-center font-semibold text-foreground">
                    Premium
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.label}>
                    <td className="py-3.5 pr-4 pl-5 text-foreground/90">
                      {row.label}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <CompareCell value={row.trial} />
                    </td>
                    <td className="bg-wash/40 px-4 py-3.5 text-center">
                      <CompareCell value={row.essentials} featured />
                    </td>
                    <td className="px-4 py-3.5 pr-5 text-center">
                      <CompareCell value={row.premium} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
