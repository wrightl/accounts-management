import Link from "next/link";
import { guardPage } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { QuoteForm } from "@/components/quotes/quote-form";
import { buttonClasses } from "@/components/ui/button";
import { isDatabaseConfigured } from "@/env";

export default async function NewQuotePage() {
  await guardPage("accounts:write");

  if (!isDatabaseConfigured()) {
    return <p className="text-muted">Connect a database to create quotes.</p>;
  }

  const clients = await listClients();

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard/quotes" className={buttonClasses("ghost")}>
          ← Quotes
        </Link>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">New quote</h1>
      {clients.length === 0 ? (
        <p className="text-sm text-muted">
          Add a{" "}
          <Link href="/dashboard/clients/new" className="text-foreground underline">
            client
          </Link>{" "}
          before creating a quote.
        </p>
      ) : (
        <div className="max-w-2xl">
        <QuoteForm mode="create" clients={clients} />
        </div>
      )}
    </div>
  );
}
