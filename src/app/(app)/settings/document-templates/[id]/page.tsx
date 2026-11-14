import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { guardTenantPage } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import { companySampleDesignData } from "@/lib/pdf/designer/sample-data";
import { getDocumentTemplate, listTemplateAssets } from "@/lib/pdf/designer/queries";
import { getCompanySettings } from "@/lib/settings/queries";
import { Designer } from "@/components/invoice-designer/designer";

export const metadata: Metadata = { title: "Template designer" };

export default async function DocumentTemplateDesignerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId } = await guardTenantPage("settings:manage");
  const { id } = await params;

  const entitlements = await getEntitlements(companyId);
  if (!entitlements.invoiceDesigner) redirect("/settings/document-templates");

  const [template, assets, company] = await Promise.all([
    /^[0-9a-f-]{36}$/i.test(id) ? getDocumentTemplate(companyId, id) : null,
    listTemplateAssets(companyId),
    getCompanySettings(companyId),
  ]);
  if (!template) notFound();

  const data = companySampleDesignData(company, template.kind);

  return (
    <Designer
      templateId={template.id}
      kind={template.kind}
      initialName={template.name}
      initialDesign={template.design}
      initialAssets={assets}
      data={data}
      hasLogo={Boolean(company.logoUrl)}
    />
  );
}
