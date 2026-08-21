import { guardPage } from "@/lib/auth";
import { SectionStub } from "@/components/dashboard/section-stub";

export default async function SettingsPage() {
  await guardPage("settings:manage");
  return (
    <SectionStub
      title="Settings"
      description="Company profile, bank details (Starling), financial year end and invoice branding."
      phase={0}
    />
  );
}
