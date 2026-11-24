import { notFound } from "next/navigation";
import { guardTenantPage } from "@/lib/auth";
import { hmrcConnectEnabled } from "@/lib/hmrc/config";
import { getHmrcConnectionStatus } from "@/lib/hmrc/connections";
import { HmrcConnectionPanel, type HmrcOutcome } from "@/components/settings/hmrc-connection-panel";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";

const OUTCOMES: readonly HmrcOutcome[] = ["connected", "denied", "expired", "failed", "forbidden", "unavailable"];

export default async function HmrcSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ hmrc?: string }>;
}) {
  const { companyId } = await guardTenantPage("tax:connect");
  if (!hmrcConnectEnabled()) notFound();
  const sp = await searchParams;
  const status = await getHmrcConnectionStatus(companyId);
  const outcome = OUTCOMES.find((o) => o === sp.hmrc) ?? null;

  return (
    <div>
      <SettingsPageHeader
        title="HMRC"
        description="Connect Alfa to HMRC so it can file your returns for you."
      />
      <HmrcConnectionPanel
        environment={status.environment}
        connected={status.connected}
        connectedAt={status.connectedAt?.toISOString() ?? null}
        grantExpiresAt={status.grantExpiresAt?.toISOString() ?? null}
        lastUsedAt={status.lastUsedAt?.toISOString() ?? null}
        daysLeft={status.daysLeft}
        outcome={outcome}
      />
    </div>
  );
}
