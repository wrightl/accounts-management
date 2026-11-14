"use server";

import { and, count, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companies,
  invoiceTemplateAssets,
  invoiceTemplates,
  invoices,
  quotes,
} from "@/db/schema";
import { getEntitlements } from "@/lib/billing/entitlements";
import { isLogoContentType } from "@/lib/company-logo-file";
import { sniffReceiptContentType } from "@/lib/expenses/receipt-file";
import { mutate } from "@/lib/mutate";
import {
  MAX_COMPANY_TEMPLATES,
  MAX_COMPANY_TEMPLATE_ASSETS,
  getDocumentTemplate,
} from "@/lib/pdf/designer/queries";
import { designAssetIds } from "@/lib/pdf/designer/assets";
import { convertDesign } from "@/lib/pdf/designer/convert";
import {
  parseTemplateDesign,
  templateNameSchema,
  type TemplateDesign,
} from "@/lib/pdf/designer/schema";
import { starterDesign } from "@/lib/pdf/designer/starters";
import {
  DEFAULT_TEMPLATE_KEY,
  isDocumentKind,
  isTemplateKey,
  type DocumentKind,
} from "@/lib/pdf/templates/registry";
import { getStorage } from "@/lib/storage";
import type { ActionResult } from "@/actions/result";

const TEMPLATE_PATHS = ["/settings/document-templates"];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const DESIGNER_UPSELL = "Designing your own templates is part of the Premium plan.";

/** The two company columns holding what is chosen for each kind of document. */
const CHOICE_COLUMNS = {
  invoice: { key: "invoiceTemplateKey", custom: "invoiceCustomTemplateId" },
  quote: { key: "quoteTemplateKey", custom: "quoteCustomTemplateId" },
  "credit-note": { key: "creditNoteTemplateKey", custom: "creditNoteCustomTemplateId" },
} as const satisfies Record<DocumentKind, { key: string; custom: string }>;

/**
 * Drafts haven't gone to a client, so they take the new look. Anything
 * already issued keeps the PDF it was sent with. Credit notes are drawn each
 * time and have nothing stored.
 */
async function clearDraftPdfCaches(companyId: string, kind: DocumentKind): Promise<void> {
  const db = getDb();
  if (kind === "invoice") {
    await db
      .update(invoices)
      .set({ pdfBlobPath: null })
      .where(and(eq(invoices.companyId, companyId), eq(invoices.status, "draft")));
  } else if (kind === "quote") {
    await db
      .update(quotes)
      .set({ pdfBlobPath: null })
      .where(and(eq(quotes.companyId, companyId), eq(quotes.status, "draft")));
  }
}

/** The kind of one of the company's designs, or null when it has no such design. */
async function templateKind(companyId: string, id: string): Promise<DocumentKind | null> {
  const [row] = await getDb()
    .select({ kind: invoiceTemplates.kind })
    .from(invoiceTemplates)
    .where(and(eq(invoiceTemplates.id, id), eq(invoiceTemplates.companyId, companyId)))
    .limit(1);
  return row && isDocumentKind(row.kind) ? row.kind : null;
}

/** Whether this design is the one the company's documents of its kind use. */
async function isSelected(companyId: string, id: string, kind: DocumentKind): Promise<boolean> {
  const [company] = await getDb()
    .select({
      invoiceCustomTemplateId: companies.invoiceCustomTemplateId,
      quoteCustomTemplateId: companies.quoteCustomTemplateId,
      creditNoteCustomTemplateId: companies.creditNoteCustomTemplateId,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return company?.[CHOICE_COLUMNS[kind].custom] === id;
}

async function atTemplateLimit(companyId: string): Promise<boolean> {
  const [existing] = await getDb()
    .select({ n: count() })
    .from(invoiceTemplates)
    .where(eq(invoiceTemplates.companyId, companyId));
  return Number(existing?.n ?? 0) >= MAX_COMPANY_TEMPLATES;
}

const TEMPLATE_LIMIT_ERROR = `You can keep up to ${MAX_COMPANY_TEMPLATES} of your own templates. Delete one to add another.`;

/** The design, once it reads as valid and uses only this company's pictures. */
async function checkDesign(
  companyId: string,
  raw: unknown,
): Promise<{ ok: true; design: TemplateDesign } | { ok: false; error: string }> {
  const parsed = parseTemplateDesign(raw);
  if (!parsed.ok) return parsed;

  const assetIds = designAssetIds(parsed.design);
  if (assetIds.length > 0) {
    const owned = await getDb()
      .select({ id: invoiceTemplateAssets.id })
      .from(invoiceTemplateAssets)
      .where(
        and(
          eq(invoiceTemplateAssets.companyId, companyId),
          inArray(invoiceTemplateAssets.id, assetIds),
        ),
      );
    if (owned.length !== assetIds.length) {
      return { ok: false, error: "This design uses a picture that is no longer available." };
    }
  }
  return parsed;
}

/**
 * Choose what one kind of document is drawn in: a library template
 * (`templateKey`) or one of the company's own designs (`customTemplateId`).
 * The other kinds are left as they are.
 */
export async function selectDocumentTemplate(
  input:
    | { kind: string; templateKey: string; customTemplateId?: undefined }
    | { kind: string; customTemplateId: string; templateKey?: undefined },
): Promise<ActionResult> {
  if (!isDocumentKind(input.kind)) return { ok: false, error: "Choose a template from the list." };
  const kind = input.kind;
  const templateKey = input.templateKey;
  const customTemplateId = input.customTemplateId ?? null;
  if (!customTemplateId && !isTemplateKey(templateKey)) {
    return { ok: false, error: "Choose a template from the list." };
  }

  return mutate(
    "settings:manage",
    async ({ companyId }) => {
      const entitlements = await getEntitlements(companyId);
      const columns = CHOICE_COLUMNS[kind];

      if (customTemplateId) {
        if (!entitlements.invoiceDesigner) return { ok: false, error: DESIGNER_UPSELL };
        if ((await templateKind(companyId, customTemplateId)) !== kind) {
          return { ok: false, error: "That template no longer exists." };
        }
        // The library choice is kept, ready for when the design is removed.
        await getDb()
          .update(companies)
          .set({ [columns.custom]: customTemplateId, updatedAt: new Date() })
          .where(eq(companies.id, companyId));
      } else {
        if (!entitlements.invoiceTemplates && templateKey !== DEFAULT_TEMPLATE_KEY) {
          return { ok: false, error: "Your plan doesn't include the template library." };
        }
        await getDb()
          .update(companies)
          .set({ [columns.key]: templateKey, [columns.custom]: null, updatedAt: new Date() })
          .where(eq(companies.id, companyId));
      }

      await clearDraftPdfCaches(companyId, kind);
      return { ok: true, id: companyId };
    },
    {
      audit: {
        action: "settings.document_template",
        entityType: "company_settings",
        meta: { kind, templateKey: templateKey ?? null, customTemplateId },
      },
      paths: TEMPLATE_PATHS,
    },
  );
}

export async function createDocumentTemplate(input: {
  name: string;
  starter: string;
  kind: string;
}): Promise<ActionResult> {
  const name = templateNameSchema.safeParse(input.name);
  if (!name.success) {
    const error = name.error.issues[0]?.message ?? "Give the template a name";
    return { ok: false, error, fieldErrors: { name: error } };
  }
  if (!isDocumentKind(input.kind)) return { ok: false, error: "Choose what the template is for." };
  const kind = input.kind;

  return mutate(
    "settings:manage",
    async ({ companyId }) => {
      const entitlements = await getEntitlements(companyId);
      if (!entitlements.invoiceDesigner) return { ok: false, error: DESIGNER_UPSELL };
      if (await atTemplateLimit(companyId)) return { ok: false, error: TEMPLATE_LIMIT_ERROR };

      const [row] = await getDb()
        .insert(invoiceTemplates)
        .values({ companyId, name: name.data, kind, design: starterDesign(input.starter, kind) })
        .returning({ id: invoiceTemplates.id });
      return { ok: true, id: row.id };
    },
    {
      audit: { action: "document_template.create", entityType: "invoice_template", meta: { kind } },
      paths: TEMPLATE_PATHS,
    },
  );
}

export async function updateDocumentTemplate(
  id: string,
  input: { name: string; design: unknown },
): Promise<ActionResult> {
  const name = templateNameSchema.safeParse(input.name);
  if (!name.success) {
    const error = name.error.issues[0]?.message ?? "Give the template a name";
    return { ok: false, error, fieldErrors: { name: error } };
  }

  return mutate(
    "settings:manage",
    async ({ companyId }) => {
      const entitlements = await getEntitlements(companyId);
      if (!entitlements.invoiceDesigner) return { ok: false, error: DESIGNER_UPSELL };

      const checked = await checkDesign(companyId, input.design);
      if (!checked.ok) return checked;

      const [row] = await getDb()
        .update(invoiceTemplates)
        .set({ name: name.data, design: checked.design, updatedAt: new Date() })
        .where(and(eq(invoiceTemplates.id, id), eq(invoiceTemplates.companyId, companyId)))
        .returning({ id: invoiceTemplates.id, kind: invoiceTemplates.kind });
      if (!row) return { ok: false, error: "That template no longer exists." };

      if (isDocumentKind(row.kind) && (await isSelected(companyId, id, row.kind))) {
        await clearDraftPdfCaches(companyId, row.kind);
      }
      return { ok: true, id };
    },
    {
      audit: { action: "document_template.update", entityType: "invoice_template" },
      paths: [...TEMPLATE_PATHS, `/settings/document-templates/${id}`],
    },
  );
}

export async function duplicateDocumentTemplate(id: string): Promise<ActionResult> {
  return mutate(
    "settings:manage",
    async ({ companyId }) => {
      const entitlements = await getEntitlements(companyId);
      if (!entitlements.invoiceDesigner) return { ok: false, error: DESIGNER_UPSELL };

      const source = await getDocumentTemplate(companyId, id);
      if (!source) return { ok: false, error: "That template no longer exists." };
      if (await atTemplateLimit(companyId)) return { ok: false, error: TEMPLATE_LIMIT_ERROR };

      const [row] = await getDb()
        .insert(invoiceTemplates)
        .values({
          companyId,
          name: `${source.name} copy`.slice(0, 80),
          kind: source.kind,
          design: source.design,
        })
        .returning({ id: invoiceTemplates.id });
      return { ok: true, id: row.id };
    },
    {
      audit: { action: "document_template.duplicate", entityType: "invoice_template" },
      paths: TEMPLATE_PATHS,
    },
  );
}

/**
 * Make a copy of a design for another kind of document, so the three kinds
 * can share a look. The design it was made from is kept as it is.
 */
export async function convertDocumentTemplate(
  id: string,
  input: { kind: string; name: string },
): Promise<ActionResult> {
  const name = templateNameSchema.safeParse(input.name);
  if (!name.success) {
    const error = name.error.issues[0]?.message ?? "Give the template a name";
    return { ok: false, error, fieldErrors: { name: error } };
  }
  if (!isDocumentKind(input.kind)) return { ok: false, error: "Choose what to convert it to." };
  const kind = input.kind;

  return mutate(
    "settings:manage",
    async ({ companyId }) => {
      const entitlements = await getEntitlements(companyId);
      if (!entitlements.invoiceDesigner) return { ok: false, error: DESIGNER_UPSELL };

      const source = await getDocumentTemplate(companyId, id);
      if (!source) return { ok: false, error: "That template no longer exists." };
      if (source.kind === kind) return { ok: false, error: "Choose a different kind of document." };
      if (await atTemplateLimit(companyId)) return { ok: false, error: TEMPLATE_LIMIT_ERROR };

      const converted = parseTemplateDesign(convertDesign(source.design, source.kind, kind));
      if (!converted.ok) return converted;

      const [row] = await getDb()
        .insert(invoiceTemplates)
        .values({ companyId, name: name.data, kind, design: converted.design })
        .returning({ id: invoiceTemplates.id });
      return { ok: true, id: row.id };
    },
    {
      audit: { action: "document_template.convert", entityType: "invoice_template", meta: { kind } },
      paths: TEMPLATE_PATHS,
    },
  );
}

export async function deleteDocumentTemplate(id: string): Promise<ActionResult> {
  return mutate(
    "settings:manage",
    async ({ companyId }) => {
      const kind = await templateKind(companyId, id);
      const selected = kind ? await isSelected(companyId, id, kind) : false;

      const [row] = await getDb()
        .delete(invoiceTemplates)
        .where(and(eq(invoiceTemplates.id, id), eq(invoiceTemplates.companyId, companyId)))
        .returning({ id: invoiceTemplates.id });
      if (!row) return { ok: false, error: "That template no longer exists." };

      // Documents fall back to the library template once the design in use is gone.
      if (kind && selected) await clearDraftPdfCaches(companyId, kind);
      return { ok: true, id };
    },
    {
      audit: { action: "document_template.delete", entityType: "invoice_template" },
      paths: TEMPLATE_PATHS,
    },
  );
}

/** Store a picture for use in the company's designs. The id comes back in `id`. */
export async function uploadTemplateImage(formData: FormData): Promise<ActionResult> {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image file" };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Pictures must be under 2 MB" };
  }

  return mutate(
    "settings:manage",
    async ({ companyId }) => {
      const entitlements = await getEntitlements(companyId);
      if (!entitlements.invoiceDesigner) return { ok: false, error: DESIGNER_UPSELL };

      const bytes = Buffer.from(await file.arrayBuffer());
      // Read from the file's bytes, never its name or what the browser says it is.
      const contentType = sniffReceiptContentType(bytes);
      if (!isLogoContentType(contentType)) {
        return { ok: false, error: "Pictures must be PNG, JPEG, WebP or GIF" };
      }

      const db = getDb();
      const [existing] = await db
        .select({ n: count() })
        .from(invoiceTemplateAssets)
        .where(eq(invoiceTemplateAssets.companyId, companyId));
      if (Number(existing?.n ?? 0) >= MAX_COMPANY_TEMPLATE_ASSETS) {
        return {
          ok: false,
          error: `You can keep up to ${MAX_COMPANY_TEMPLATE_ASSETS} pictures. Remove one you no longer use.`,
        };
      }

      const stored = await getStorage().put(
        `company/${companyId}/template-assets/${crypto.randomUUID()}`,
        bytes,
        contentType!,
      );
      const [row] = await db
        .insert(invoiceTemplateAssets)
        .values({
          companyId,
          blobPath: stored.path,
          contentType: contentType!,
          filename: file.name.slice(0, 120) || "image",
        })
        .returning({ id: invoiceTemplateAssets.id });
      return { ok: true, id: row.id };
    },
    { audit: { action: "document_template.image_upload", entityType: "invoice_template_asset" } },
  );
}

/** Remove an uploaded picture, unless one of the company's designs still uses it. */
export async function deleteTemplateImage(id: string): Promise<ActionResult> {
  return mutate(
    "settings:manage",
    async ({ companyId }) => {
      const db = getDb();
      const designs = await db
        .select({ name: invoiceTemplates.name, design: invoiceTemplates.design })
        .from(invoiceTemplates)
        .where(eq(invoiceTemplates.companyId, companyId));
      const usedBy = designs.find((row) => {
        const parsed = parseTemplateDesign(row.design);
        return parsed.ok && designAssetIds(parsed.design).includes(id);
      });
      if (usedBy) {
        return { ok: false, error: `"${usedBy.name}" still uses this picture.` };
      }

      const [row] = await db
        .delete(invoiceTemplateAssets)
        .where(
          and(eq(invoiceTemplateAssets.id, id), eq(invoiceTemplateAssets.companyId, companyId)),
        )
        .returning({ blobPath: invoiceTemplateAssets.blobPath });
      if (!row) return { ok: false, error: "That picture no longer exists." };

      try {
        await getStorage().delete(row.blobPath);
      } catch {
        // The record is gone; a stray file is harmless.
      }
      return { ok: true, id };
    },
    { audit: { action: "document_template.image_delete", entityType: "invoice_template_asset" } },
  );
}
