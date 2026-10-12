import type { Metadata } from "next";
import { guardTenantPage } from "@/lib/auth";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { ReminderSettingsForm } from "@/components/settings/reminder-settings-form";
import { todayIsoDate } from "@/lib/dates";
import { addDays } from "@/lib/ledger/corporation-tax";
import { latePaymentCharge } from "@/lib/late-payment";
import { formatGBP } from "@/lib/money";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";

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
      <SettingsPageHeader
        title="Payment reminders"
        description="Chase unpaid invoices automatically."
      />
      <ReminderSettingsForm
        remindersEnabled={company.remindersEnabled}
        schedule={company.reminderScheduleDays}
        latePaymentCharges={company.latePaymentCharges}
        exampleCharge={`For example, £5,000 paid 30 days late adds ${formatGBP(example.interestPence)} interest at ${example.ratePercent}% plus ${formatGBP(example.compensationPence)} compensation.`}
      />
    </div>
  );
}
