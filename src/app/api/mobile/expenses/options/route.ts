import { NextResponse } from "next/server";
import { listClients } from "@/lib/clients/queries";
import { clientDisplayName } from "@/lib/clients/display";
import { EXPENSE_CATEGORIES } from "@/lib/expenses/categories";
import { EXPENSE_CURRENCIES } from "@/lib/expenses/currency";
import { listFounders } from "@/lib/expenses/queries";
import { requireMobileAuth } from "@/lib/mobile-auth";
import { listOrderOptions } from "@/lib/profitability/queries";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { defaultLineTax, rateForTaxCode, taxCodeInfo, taxCodesFor } from "@/lib/tax-codes";
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
        currencies: EXPENSE_CURRENCIES,
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
        // The codes an expense can use, in the web picker's order. vatRate is
        // still sent with them for servers and screens that only know rates.
        taxCodes: taxCodesFor("purchases").map((code) => ({
          code,
          label: taxCodeInfo(code).label,
          rate: rateForTaxCode(code),
        })),
        defaultTaxCode: defaultLineTax(settings).taxCode,
        defaultMileageRatePence: settings.defaultMileageRatePence,
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
