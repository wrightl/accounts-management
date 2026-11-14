import type { Metadata } from "next";
import { guardTenantPage } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import { listDocumentTemplates } from "@/lib/pdf/designer/queries";
import { companySampleDesignData } from "@/lib/pdf/designer/sample-data";
import {
  DEFAULT_TEMPLATE_KEY,
  isDocumentKind,
  type DocumentKind,
} from "@/lib/pdf/templates/registry";
import { templateChoice } from "@/lib/pdf/templates/resolve";
import { getCompanySettings } from "@/lib/settings/queries";
import {
  DocumentTemplates,
  type TemplateSelection,
} from "@/components/document-templates/document-templates";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { PAGE_WIDTH } from "@/components/ui/page-width";

export const metadata: Metadata = { title: "Document templates" };

export default async function DocumentTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { companyId } = await guardTenantPage("settings:manage");
  const [{ type }, company, entitlements, templates] = await Promise.all([
    searchParams,
    getCompanySettings(companyId),
    getEntitlements(companyId),
    listDocumentTemplates(companyId),
  ]);

  // What is shown as in use matches what the PDFs are drawn in (see getCompanyTemplate).
  const selection = (kind: DocumentKind): TemplateSelection => {
    const choice = templateChoice(company, kind);
    const own = templates.find(
      (template) => template.id === choice.customTemplateId && template.kind === kind,
    );
    if (own && entitlements.invoiceDesigner) return { type: "custom", id: own.id };
    return {
      type: "standard",
      key: entitlements.invoiceTemplates ? choice.key : DEFAULT_TEMPLATE_KEY,
    };
  };

  return (
    <div className={PAGE_WIDTH.editor}>
      <SettingsPageHeader
        title="Document templates"
        description="Choose how your invoices, quotes and credit notes look, or design your own."
      />
      <DocumentTemplates
        initialKind={isDocumentKind(type) ? type : "invoice"}
        selections={{
          invoice: selection("invoice"),
          quote: selection("quote"),
          "credit-note": selection("credit-note"),
        }}
        customTemplates={templates}
        sampleData={{
          invoice: companySampleDesignData(company, "invoice"),
          quote: companySampleDesignData(company, "quote"),
          "credit-note": companySampleDesignData(company, "credit-note"),
        }}
        hasLogo={Boolean(company.logoUrl)}
        canUseLibrary={entitlements.invoiceTemplates}
        canUseDesigner={entitlements.invoiceDesigner}
      />
    </div>
  );
}
