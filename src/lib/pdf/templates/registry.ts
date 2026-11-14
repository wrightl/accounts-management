import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/pdf/templates/views";

export { DOCUMENT_KINDS, type DocumentKind };

/**
 * The named templates in the library. Each one comes as an invoice, a credit
 * note and a quote that look the same and differ only in the data shown.
 */
export const TEMPLATES = [
  {
    key: "modern",
    name: "Modern",
    description: "Navy letterhead band, rounded table and a total card.",
  },
  {
    key: "classic",
    name: "Classic",
    description: "A thin accent bar and a simple ruled table.",
  },
  {
    key: "minimal",
    name: "Minimal",
    description: "White page, hairline rules and a single ink colour.",
  },
  {
    key: "corporate",
    name: "Corporate",
    description: "Dark header band, boxed details and striped rows.",
  },
  {
    key: "bold",
    name: "Bold",
    description: "Pink top bar with a royal-blue table header and total.",
  },
] as const;

export type TemplateKey = (typeof TEMPLATES)[number]["key"];

export const DEFAULT_TEMPLATE_KEY: TemplateKey = "modern";

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  invoice: "Invoice",
  "credit-note": "Credit note",
  quote: "Quote",
};

export function isTemplateKey(value: unknown): value is TemplateKey {
  return TEMPLATES.some((template) => template.key === value);
}

/** A stored key, or the default when it is missing or no longer exists. */
export function resolveTemplateKey(value: string | null | undefined): TemplateKey {
  return isTemplateKey(value) ? value : DEFAULT_TEMPLATE_KEY;
}

export function isDocumentKind(value: unknown): value is DocumentKind {
  return DOCUMENT_KINDS.some((kind) => kind === value);
}

/** Picture of the template's first page, made by scripts/render-template-thumbnails.ts. */
export function templateThumbnail(key: TemplateKey, kind: DocumentKind): string {
  return `/invoice-templates/${key}-${kind}.png`;
}
