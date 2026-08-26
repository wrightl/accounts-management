import Link from "next/link";
import { guardTenantPage } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { OrderForm } from "@/components/orders/order-form";
import { buttonClasses } from "@/components/ui/button";
import { isDatabaseConfigured } from "@/env";

export default async function NewOrderPage() {
  const { companyId } = await guardTenantPage("accounts:write");

  if (!isDatabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">New order</h1>
        <p className="mt-2 text-muted">Connect a database to create orders.</p>
      </div>
    );
  }

  const clients = await listClients(companyId);

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/orders" className={buttonClasses("ghost")}>
          ← Orders
        </Link>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">New order</h1>
      <div className="max-w-2xl">
        <OrderForm clients={clients} />
      </div>
    </div>
  );
}
