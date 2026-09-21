"use client";

import { useTransition } from "react";
import { updateSubscriptionTier } from "@/actions/platform";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tier = {
  slug: string;
  name: string;
  maxUsers: number;
  vatExport: boolean;
  liveBankFeed: boolean;
  prioritySupport: boolean;
};

export function SubscriptionTiersForm({
  tiers,
  priceIds,
}: {
  tiers: Tier[];
  priceIds: Record<string, string | undefined>;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      {tiers.map((tier) => (
        <form
          key={tier.slug}
          className="rounded-2xl border border-border bg-white p-5"
          action={(fd) => {
            start(async () => {
              await updateSubscriptionTier(fd);
            });
          }}
        >
          <input type="hidden" name="slug" value={tier.slug} />
          <h2 className="font-display text-lg font-semibold">{tier.name}</h2>
          <p className="mt-1 font-mono text-xs text-muted">{tier.slug}</p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-muted">Max users (0 = unlimited)</span>
              <input
                type="number"
                name="maxUsers"
                min={0}
                max={1000}
                defaultValue={tier.maxUsers}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              />
            </label>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="vatExport"
                  defaultChecked={tier.vatExport}
                />
                VAT export
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="liveBankFeed"
                  defaultChecked={tier.liveBankFeed}
                />
                Live bank feed (future)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="prioritySupport"
                  defaultChecked={tier.prioritySupport}
                />
                Priority support
              </label>
            </div>
          </div>

          {(tier.slug === "essentials" || tier.slug === "premium") && (
            <dl className="mt-4 space-y-1 text-xs text-muted">
              <div>
                Monthly price ID:{" "}
                <span className="font-mono">
                  {priceIds[`${tier.slug}_month`] ?? "—"}
                </span>
              </div>
              <div>
                Yearly price ID:{" "}
                <span className="font-mono">
                  {priceIds[`${tier.slug}_year`] ?? "—"}
                </span>
              </div>
            </dl>
          )}

          <button
            type="submit"
            disabled={pending}
            className={cn(buttonClasses("primary"), "mt-4")}
          >
            Save {tier.name}
          </button>
        </form>
      ))}
    </div>
  );
}
