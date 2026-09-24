import { requirePlatformAdmin } from "@/lib/platform";
import { hasDatabaseClient } from "@/db";
import { getPlatformSettings } from "@/lib/platform-settings";
import { listReceiptOcrGatewayModels } from "@/lib/expenses/receipt-ocr-models-catalog";
import { PlatformSettingsForm } from "@/components/platform/settings-form";
import {
  formatCatalogPounds,
  getStripeCatalog,
} from "@/lib/billing/catalog";

export default async function PlatformSettingsPage() {
  await requirePlatformAdmin();

  if (!hasDatabaseClient()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <p className="mt-2 text-muted">Connect a database to edit settings.</p>
      </div>
    );
  }

  const [settings, ocrModels, catalog] = await Promise.all([
    getPlatformSettings(),
    listReceiptOcrGatewayModels(),
    getStripeCatalog(),
  ]);

  const catalogPreview = {
    essentials: catalog
      ? {
          name: catalog.essentials.name,
          description: catalog.essentials.description,
          monthLabel: formatCatalogPounds(catalog.essentials.month.amountPence),
          yearLabel: formatCatalogPounds(catalog.essentials.year.amountPence),
        }
      : null,
    premium: catalog
      ? {
          name: catalog.premium.name,
          description: catalog.premium.description,
          monthLabel: formatCatalogPounds(catalog.premium.month.amountPence),
          yearLabel: formatCatalogPounds(catalog.premium.year.amountPence),
        }
      : null,
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">System settings</h1>
      <p className="mt-1 text-muted">
        Non-secret platform knobs. API keys stay in environment variables.
        Receipt OCR applies to every company. Stripe price IDs live here.
      </p>
      <PlatformSettingsForm
        initial={{
          maintenanceBanner: settings.maintenanceBanner,
          defaultReceiptOcrProvider: settings.defaultReceiptOcrProvider,
          defaultReceiptOcrModel: settings.defaultReceiptOcrModel,
          stripePriceEssentialsMonthly: settings.stripePriceEssentialsMonthly,
          stripePriceEssentialsYearly: settings.stripePriceEssentialsYearly,
          stripePricePremiumMonthly: settings.stripePricePremiumMonthly,
          stripePricePremiumYearly: settings.stripePricePremiumYearly,
        }}
        ocrModels={ocrModels}
        catalogPreview={catalogPreview}
      />
    </div>
  );
}
