import { requirePlatformAdmin } from "@/lib/platform";
import { isDatabaseConfigured } from "@/env";
import { hasDatabaseClient } from "@/db";
import { getPlatformSettings } from "@/lib/platform-settings";
import { listReceiptOcrGatewayModels } from "@/lib/expenses/receipt-ocr-models-catalog";
import { PlatformSettingsForm } from "@/components/platform/settings-form";

export default async function PlatformSettingsPage() {
  await requirePlatformAdmin();

  if (!isDatabaseConfigured() || !hasDatabaseClient()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <p className="mt-2 text-muted">Connect a database to edit settings.</p>
      </div>
    );
  }

  const [settings, ocrModels] = await Promise.all([
    getPlatformSettings(),
    listReceiptOcrGatewayModels(),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">System settings</h1>
      <p className="mt-1 text-muted">
        Non-secret platform knobs. API keys stay in environment variables.
        Receipt OCR applies to every company.
      </p>
      <PlatformSettingsForm
        initial={{
          maintenanceBanner: settings.maintenanceBanner,
          recurringInvoicesEnabled: settings.recurringInvoicesEnabled,
          defaultReceiptOcrProvider: settings.defaultReceiptOcrProvider,
          defaultReceiptOcrModel: settings.defaultReceiptOcrModel,
        }}
        ocrModels={ocrModels}
      />
    </div>
  );
}
