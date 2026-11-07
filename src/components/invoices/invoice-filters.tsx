"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { PeriodRangeSelect } from "@/components/period/bank-period-range-select";
import { buttonClasses } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import {
  INVOICE_STATUS_FILTER_OPTIONS,
  hasActiveInvoiceFilters,
  invoiceListHref,
  type InvoiceListParams,
} from "@/lib/invoices/list-params";
import { cn } from "@/lib/utils";

/**
 * Invoice filters driven entirely by the URL: each dropdown navigates as soon
 * as it changes, like the transactions and expenses filters. Any change goes
 * back to the first page.
 */
export function InvoiceFilters({
  params,
  clients,
  showDraftAndVoid,
}: {
  params: InvoiceListParams;
  clients: { id: string; label: string }[];
  /** Off for the accountant pack, which never shows drafts or voids. */
  showDraftAndVoid: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const apply = (overrides: Partial<InvoiceListParams>) => {
    startTransition(() => {
      router.push(invoiceListHref(params, { ...overrides, page: 1 }), { scroll: false });
    });
  };

  const statusOptions = showDraftAndVoid
    ? INVOICE_STATUS_FILTER_OPTIONS
    : INVOICE_STATUS_FILTER_OPTIONS.filter((o) => o.value !== "draft" && o.value !== "void");

  return (
    <form
      role="search"
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q");
        apply({ q: typeof q === "string" ? q.trim().slice(0, 200) : "" });
      }}
      className={cn(
        "grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2 lg:grid-cols-5",
        pending && "opacity-70",
      )}
    >
      <div className="sm:col-span-2">
        <Label htmlFor="q">Search</Label>
        {/* Keyed on the URL value so Clear and back/forward reset the box. */}
        <Input
          key={params.q}
          id="q"
          name="q"
          type="search"
          placeholder="Number, client or order…"
          defaultValue={params.q}
        />
      </div>
      <div>
        <Label htmlFor="status">Status</Label>
        <Select
          id="status"
          value={params.status}
          onChange={(e) => apply({ status: e.target.value as InvoiceListParams["status"] })}
        >
          <option value="">All</option>
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="client">Client</Label>
        <Select id="client" value={params.client} onChange={(e) => apply({ client: e.target.value })}>
          <option value="">All</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <PeriodRangeSelect value={params} onSelect={(range) => apply(range)} />
      </div>
      <div className="flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-5">
        <button type="submit" className={buttonClasses("secondary")}>
          Search
        </button>
        {hasActiveInvoiceFilters(params) ? (
          <Link
            href={invoiceListHref(params, {
              q: "",
              status: "",
              client: "",
              period: "",
              from: "",
              to: "",
              page: 1,
            })}
            scroll={false}
            className="text-sm text-muted hover:text-foreground hover:underline"
          >
            Clear filters
          </Link>
        ) : null}
      </div>
    </form>
  );
}
