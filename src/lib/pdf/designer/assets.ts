import type { TemplateDesign } from "@/lib/pdf/designer/schema";

/** Ids of the uploaded pictures a design uses. */
export function designAssetIds(design: TemplateDesign): string[] {
  const ids = new Set<string>();
  for (const element of design.elements) {
    if (element.type === "image" && element.source.kind === "asset") {
      ids.add(element.source.assetId);
    }
  }
  return [...ids];
}
