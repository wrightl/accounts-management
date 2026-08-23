export const DEFAULT_RECEIPT_OCR_MODEL = "google/gemini-2.5-flash";
export const CUSTOM_RECEIPT_OCR_MODEL = "__custom__";
export const RECEIPT_OCR_MODEL_MAX = 120;

/** AI Gateway slug: `provider/model`, e.g. google/gemini-2.5-flash. */
export const GATEWAY_MODEL_ID_RE =
  /^[a-z0-9][a-z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9./:_-]*$/;

const PREFERRED_OWNERS = ["google", "openai", "anthropic"] as const;

export type ReceiptOcrModelOption = {
  id: string;
  name: string;
};

/** Used when the live catalog cannot be loaded. */
export const FALLBACK_RECEIPT_OCR_MODELS: ReceiptOcrModelOption[] = [
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  { id: "google/gemini-3.5-flash", name: "Gemini 3.5 Flash" },
  { id: "google/gemini-3.7-flash", name: "Gemini 3.7 Flash" },
  { id: "openai/gpt-5.4", name: "GPT 5.4" },
  { id: "openai/gpt-5.4-mini", name: "GPT 5.4 Mini" },
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5" },
];

export type GatewayCatalogModel = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  owned_by?: unknown;
  deprecated_at?: unknown;
  tags?: unknown;
  modalities?: unknown;
  released?: unknown;
};

export function isGatewayModelId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= RECEIPT_OCR_MODEL_MAX &&
    GATEWAY_MODEL_ID_RE.test(value)
  );
}

export function normalizeReceiptOcrModel(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return isGatewayModelId(trimmed) ? trimmed : DEFAULT_RECEIPT_OCR_MODEL;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function ownerRank(owner: string): number {
  const idx = PREFERRED_OWNERS.indexOf(owner as (typeof PREFERRED_OWNERS)[number]);
  return idx === -1 ? PREFERRED_OWNERS.length : idx;
}

/**
 * Keep models that can read receipt images and PDFs, dropping image-generation
 * and coding/reasoning SKUs that are a poor fit for expense OCR.
 */
export function selectReceiptOcrModels(models: GatewayCatalogModel[]): ReceiptOcrModelOption[] {
  const picked: { option: ReceiptOcrModelOption; owner: string; released: number }[] = [];

  for (const model of models) {
    const id = asString(model.id);
    if (!isGatewayModelId(id)) continue;
    if (asString(model.type) && asString(model.type) !== "language") continue;
    if (model.deprecated_at) continue;

    const owner = asString(model.owned_by);
    if (!PREFERRED_OWNERS.includes(owner as (typeof PREFERRED_OWNERS)[number])) continue;

    const tags = asStringList(model.tags);
    if (tags.includes("image-generation")) continue;

    const modalities =
      model.modalities && typeof model.modalities === "object"
        ? (model.modalities as { input?: unknown; output?: unknown })
        : {};
    const input = asStringList(modalities.input);
    const output = asStringList(modalities.output);
    if (!input.includes("image") || !input.includes("pdf")) continue;
    if (output.includes("image")) continue;

    if (
      id.endsWith("-fast") ||
      id.includes("codex") ||
      id.includes("preview") ||
      id.includes("gemma") ||
      id.includes("deep-research") ||
      /^openai\/o\d/.test(id)
    ) {
      continue;
    }

    picked.push({
      option: { id, name: asString(model.name) || id },
      owner,
      released: typeof model.released === "number" ? model.released : 0,
    });
  }

  picked.sort((a, b) => {
    const byOwner = ownerRank(a.owner) - ownerRank(b.owner);
    if (byOwner !== 0) return byOwner;
    if (b.released !== a.released) return b.released - a.released;
    return a.option.id.localeCompare(b.option.id);
  });

  return picked.map((row) => row.option);
}

export function receiptOcrModelOptions(
  catalog: ReceiptOcrModelOption[],
  selected?: string | null,
): ReceiptOcrModelOption[] {
  const list = catalog.length > 0 ? [...catalog] : [...FALLBACK_RECEIPT_OCR_MODELS];
  const current = selected?.trim() ?? "";
  if (isGatewayModelId(current) && !list.some((item) => item.id === current)) {
    list.unshift({ id: current, name: current });
  }
  return list;
}
