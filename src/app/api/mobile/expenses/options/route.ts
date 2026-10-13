import { NextResponse } from "next/server";
import { listClients } from "@/lib/clients/queries";
import { clientDisplayName } from "@/lib/clients/display";
import { EXPENSE_CATEGORIES } from "@/lib/expenses/categories";
import { listFounders } from "@/lib/expenses/queries";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { listOrderOptions } from "@/lib/profitability/queries";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { ensureLocalUser } from "@/lib/users";

/** Choices for the capture and approve forms, as the web expense form loads them. */
export async function GET() {
  try {
    const authz = await requireMobileAuth("accounts:write");
    if (!authz.ok) return authz.response;
    const { user } = authz;

    const [founders, clients, orders, settings, localUserId] = await Promise.all([
      listFounders(user.companyId),
      listClients(user.companyId),
      listOrderOptions(user.companyId),
      getOrCreateCompanySettings(user.companyId),
      ensureLocalUser(user),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        categories: EXPENSE_CATEGORIES,
        payers: founders.map((f) => ({ id: f.id, name: f.name || f.email })),
        defaultPayerId: founders.some((f) => f.id === localUserId)
          ? localUserId
          : (founders[0]?.id ?? null),
        clients: clients.map((c) => ({ id: c.id, name: clientDisplayName(c) })),
        orders: orders.map((o) => ({
          id: o.id,
          number: o.number,
          clientId: o.clientId,
          clientName: o.clientName,
        })),
        vatRegistered: settings.vatRegistered,
        defaultVatRate: settings.vatRegistered ? settings.defaultVatRate : 0,
      },
    });
  } catch (error) {
    console.error("Expense options error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
