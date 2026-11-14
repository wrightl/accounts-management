import "server-only";
import React from "react";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { invoiceTemplateAssets } from "@/db/schema";
import { resolvePdfCompanyEmail } from "@/lib/pdf/company-email";
import { designAssetIds } from "@/lib/pdf/designer/assets";
import { sampleDesignData, type DesignData } from "@/lib/pdf/designer/fields";
import { DesignDocument, type DesignImages } from "@/lib/pdf/designer/render-pdf";
import type { TemplateDesign } from "@/lib/pdf/designer/schema";
import { resolveCompanyPdfLogoSrc } from "@/lib/pdf/logo";
import { renderElement } from "@/lib/pdf/templates/render";
import type { PdfCompany } from "@/lib/pdf/templates/types";
import type { DocumentKind } from "@/lib/pdf/templates/views";
import { getStorage } from "@/lib/storage";

/** The logo and uploaded pictures a design uses, as data URIs. Unreadable ones are skipped. */
async function loadDesignImages(
  companyId: string,
  design: TemplateDesign,
  logoUrl: string | null | undefined,
): Promise<DesignImages> {
  const images: DesignImages = {};
  const usesLogo = design.elements.some(
    (element) => element.type === "image" && element.source.kind === "logo",
  );
  if (usesLogo) {
    images.logo = (await resolveCompanyPdfLogoSrc(logoUrl)) ?? undefined;
  }

  const assetIds = designAssetIds(design);
  if (assetIds.length === 0) return images;

  const rows = await getDb()
    .select({
      id: invoiceTemplateAssets.id,
      blobPath: invoiceTemplateAssets.blobPath,
      contentType: invoiceTemplateAssets.contentType,
    })
    .from(invoiceTemplateAssets)
    .where(
      and(
        eq(invoiceTemplateAssets.companyId, companyId),
        inArray(invoiceTemplateAssets.id, assetIds),
      ),
    );
  await Promise.all(
    rows.map(async (row) => {
      try {
        const stored = await getStorage().get(row.blobPath);
        images[row.id] =
          `data:${row.contentType};base64,${Buffer.from(stored.body).toString("base64")}`;
      } catch {
        // Leave the picture out rather than fail the document.
      }
    }),
  );
  return images;
}

/** A document drawn from a design made in the template designer. */
export async function renderDesignPdf(params: {
  companyId: string;
  design: TemplateDesign;
  data: DesignData;
}): Promise<Uint8Array> {
  const images = await loadDesignImages(
    params.companyId,
    params.design,
    params.data.company.logoUrl,
  );
  return renderElement(
    <DesignDocument design={params.design} data={params.data} images={images} />,
  );
}

/** A design drawn with made-up figures for its kind of document and the company's own details. */
export async function renderDesignSamplePdf(params: {
  companyId: string;
  design: TemplateDesign;
  kind: DocumentKind;
  company: PdfCompany;
}): Promise<Uint8Array> {
  return renderDesignPdf({
    companyId: params.companyId,
    design: params.design,
    data: {
      ...sampleDesignData(params.kind),
      company: params.company,
      contactEmail: resolvePdfCompanyEmail(params.company.email),
    },
  });
}
