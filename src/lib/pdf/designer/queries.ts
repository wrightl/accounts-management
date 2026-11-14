import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoiceTemplateAssets, invoiceTemplates } from "@/db/schema";
import { parseTemplateDesign, type TemplateDesign } from "@/lib/pdf/designer/schema";
import { isDocumentKind, type DocumentKind } from "@/lib/pdf/templates/registry";

/** Most designs a company can keep, across invoices, quotes and credit notes. */
export const MAX_COMPANY_TEMPLATES = 20;
/** Most uploaded pictures a company can keep across its designs. */
export const MAX_COMPANY_TEMPLATE_ASSETS = 40;

export interface DocumentTemplate {
  id: string;
  name: string;
  kind: DocumentKind;
  design: TemplateDesign;
}

function toTemplate(row: {
  id: string;
  name: string;
  kind: string;
  design: unknown;
}): DocumentTemplate | null {
  const parsed = parseTemplateDesign(row.design);
  if (!parsed.ok || !isDocumentKind(row.kind)) return null;
  return { id: row.id, name: row.name, kind: row.kind, design: parsed.design };
}

/** A company's designs, oldest first. Ones that no longer read as valid are left out. */
export async function listDocumentTemplates(companyId: string): Promise<DocumentTemplate[]> {
  const rows = await getDb()
    .select({
      id: invoiceTemplates.id,
      name: invoiceTemplates.name,
      kind: invoiceTemplates.kind,
      design: invoiceTemplates.design,
    })
    .from(invoiceTemplates)
    .where(eq(invoiceTemplates.companyId, companyId))
    .orderBy(asc(invoiceTemplates.createdAt), desc(invoiceTemplates.id));
  return rows.flatMap((row) => toTemplate(row) ?? []);
}

/** A company's design, or null when it doesn't exist or no longer reads as a valid design. */
export async function getDocumentTemplate(
  companyId: string,
  id: string,
): Promise<DocumentTemplate | null> {
  const [row] = await getDb()
    .select({
      id: invoiceTemplates.id,
      name: invoiceTemplates.name,
      kind: invoiceTemplates.kind,
      design: invoiceTemplates.design,
    })
    .from(invoiceTemplates)
    .where(and(eq(invoiceTemplates.id, id), eq(invoiceTemplates.companyId, companyId)))
    .limit(1);
  return row ? toTemplate(row) : null;
}

export interface TemplateAssetSummary {
  id: string;
  filename: string;
}

export async function listTemplateAssets(companyId: string): Promise<TemplateAssetSummary[]> {
  return getDb()
    .select({ id: invoiceTemplateAssets.id, filename: invoiceTemplateAssets.filename })
    .from(invoiceTemplateAssets)
    .where(eq(invoiceTemplateAssets.companyId, companyId))
    .orderBy(asc(invoiceTemplateAssets.createdAt));
}
