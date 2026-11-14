import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoiceTemplates, type Company } from "@/db/schema";
import { getEntitlements } from "@/lib/billing/entitlements";
import { parseTemplateDesign, type TemplateDesign } from "@/lib/pdf/designer/schema";
import {
  DEFAULT_TEMPLATE_KEY,
  resolveTemplateKey,
  type DocumentKind,
  type TemplateKey,
} from "@/lib/pdf/templates/registry";

export interface CompanyTemplate {
  /** Library template, used when the company has no design of its own for this document. */
  key: TemplateKey;
  /** The company's own design, when it has chosen one and its plan allows it. */
  design: TemplateDesign | null;
}

export type TemplateChoice = Pick<
  Company,
  | "id"
  | "invoiceTemplateKey"
  | "invoiceCustomTemplateId"
  | "quoteTemplateKey"
  | "quoteCustomTemplateId"
  | "creditNoteTemplateKey"
  | "creditNoteCustomTemplateId"
>;

/** What a company has chosen for one kind of document, before its plan is considered. */
export function templateChoice(
  company: Omit<TemplateChoice, "id">,
  kind: DocumentKind,
): { key: TemplateKey; customTemplateId: string | null } {
  if (kind === "quote") {
    return {
      key: resolveTemplateKey(company.quoteTemplateKey),
      customTemplateId: company.quoteCustomTemplateId,
    };
  }
  if (kind === "credit-note") {
    return {
      key: resolveTemplateKey(company.creditNoteTemplateKey),
      customTemplateId: company.creditNoteCustomTemplateId,
    };
  }
  return {
    key: resolveTemplateKey(company.invoiceTemplateKey),
    customTemplateId: company.invoiceCustomTemplateId,
  };
}

/**
 * The template one kind of a company's documents is drawn in right now.
 * Anything the plan no longer covers falls back (design, then library choice)
 * instead of failing, so a downgrade never breaks a PDF.
 */
export async function getCompanyTemplate(
  company: TemplateChoice,
  kind: DocumentKind,
): Promise<CompanyTemplate> {
  const entitlements = await getEntitlements(company.id);
  const choice = templateChoice(company, kind);
  const key = entitlements.invoiceTemplates ? choice.key : DEFAULT_TEMPLATE_KEY;

  if (!entitlements.invoiceDesigner || !choice.customTemplateId) {
    return { key, design: null };
  }

  const [row] = await getDb()
    .select({ design: invoiceTemplates.design })
    .from(invoiceTemplates)
    .where(
      and(
        eq(invoiceTemplates.id, choice.customTemplateId),
        eq(invoiceTemplates.companyId, company.id),
        eq(invoiceTemplates.kind, kind),
      ),
    )
    .limit(1);
  const parsed = row ? parseTemplateDesign(row.design) : null;
  return { key, design: parsed?.ok ? parsed.design : null };
}
