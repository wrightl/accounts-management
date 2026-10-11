import type { Metadata } from "next";
import Link from "next/link";
import { guardTenantPage } from "@/lib/auth";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { ReminderSettingsForm } from "@/components/settings/reminder-settings-form";
import { todayIsoDate } from "@/lib/dates";
import { addDays } from "@/lib/ledger/corporation-tax";
import { latePaymentCharge } from "@/lib/late-payment";
import { formatGBP } from "@/lib/money";

export const metadata: Metadata = { title: "Payment reminders" };

export default async function ReminderSettingsPage() {
  const { companyId } = await guardTenantPage("settings:manage");
  const company = await getOrCreateCompanySettings(companyId);
  const today = todayIsoDate();
  const example = latePaymentCharge({
    amountDuePence: 500_000,
    dueDate: addDays(today, -30),
    asOf: today,
  })!;

  return (
    <div>
      <p className="text-sm text-muted">
        <Link href="/settings" className="hover:underline">
          ← Settings
        </Link>
      </p>
      <h1 className="mt-2 mb-2 font-display text-2xl font-semibold">Payment reminders</h1>
      <p className="mb-8 text-muted">Chase unpaid invoices automatically.</p>
      <ReminderSettingsForm
        remindersEnabled={company.remindersEnabled}
        schedule={company.reminderScheduleDays}
        latePaymentCharges={company.latePaymentCharges}
        exampleCharge={`For example, £5,000 paid 30 days late adds ${formatGBP(example.interestPence)} interest at ${example.ratePercent}% plus ${formatGBP(example.compensationPence)} compensation.`}
      />
    </div>
  );
}
