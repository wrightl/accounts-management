import { z } from "zod";

/**
 * Optional menu items. Everything else in the sidebar is core and always shown
 * (subject to role and entity type). Hiding a feature only removes its menu
 * entry: its page, calculations and reminders keep working.
 */
export const MENU_FEATURES = [
  "close",
  "bookkeeper",
  "spending",
  "reimbursements",
  "quotes",
  "orders",
  "recurring",
  "dividends",
  "shareholders",
  "directorsLoans",
  "safeToPay",
  "reserves",
  "profitability",
  "forecast",
] as const;

export type MenuFeature = (typeof MENU_FEATURES)[number];

const MENU_FEATURE_SET: ReadonlySet<string> = new Set(MENU_FEATURES);

export function isMenuFeature(value: unknown): value is MenuFeature {
  return typeof value === "string" && MENU_FEATURE_SET.has(value);
}

/** Features that only apply to limited companies. */
export const LTD_ONLY_FEATURES: ReadonlySet<MenuFeature> = new Set([
  "dividends",
  "shareholders",
  "directorsLoans",
  "safeToPay",
  "reserves",
]);

export type EntityType = "limited_company" | "sole_trader";

export function featureAppliesTo(
  feature: MenuFeature,
  entityType: string | null | undefined,
): boolean {
  return !(entityType === "sole_trader" && LTD_ONLY_FEATURES.has(feature));
}

export interface MenuBundle {
  id: string;
  /** Short name, shown in Settings → Menu. */
  label: string;
  /** Plain-language yes/no question asked during onboarding. */
  question: string;
  /** One line on what saying yes adds. */
  hint: string;
  features: MenuFeature[];
  /** Answer pre-selected in onboarding. */
  defaultOn: boolean;
  ltdOnly?: boolean;
}

/**
 * Related features grouped behind one question, so people answer a handful of
 * questions about their business rather than reviewing every menu item.
 */
export const MENU_BUNDLES: MenuBundle[] = [
  {
    id: "quotes",
    label: "Quotes and orders",
    question: "Do you send quotes or estimates before you invoice?",
    hint: "Adds Quotes and Orders.",
    features: ["quotes", "orders"],
    defaultOn: false,
  },
  {
    id: "recurring",
    label: "Recurring invoices",
    question: "Do you bill any clients the same amount on a regular schedule?",
    hint: "Adds Recurring, which sends repeat invoices for you.",
    features: ["recurring"],
    defaultOn: false,
  },
  {
    id: "payingYourself",
    label: "Paying yourself",
    question:
      "Do you take money out of the company as dividends or a director's loan?",
    hint: "Adds Dividends, Shareholders, Director's loans, Safe to pay, and Tax & reserves.",
    features: ["dividends", "shareholders", "directorsLoans", "safeToPay", "reserves"],
    defaultOn: true,
    ltdOnly: true,
  },
  {
    id: "reimbursements",
    label: "Paying people back",
    question:
      "Does anyone pay for business costs with their own money and need paying back?",
    hint: "Adds Reimbursements.",
    features: ["reimbursements"],
    defaultOn: false,
  },
  {
    id: "planning",
    label: "Planning ahead",
    question: "Would you like charts and forecasts to help you plan ahead?",
    hint: "Adds Spending, Profitability, and Cash forecast.",
    features: ["spending", "profitability", "forecast"],
    defaultOn: false,
  },
  {
    id: "routine",
    label: "Weekly routine",
    question: "Would you like help keeping on top of your books each week?",
    hint: "Adds Weekly close and the AI bookkeeper.",
    features: ["close", "bookkeeper"],
    defaultOn: false,
  },
];

export function bundlesFor(entityType: string | null | undefined): MenuBundle[] {
  return MENU_BUNDLES.filter(
    (bundle) => !(bundle.ltdOnly && entityType === "sole_trader"),
  );
}

/** Enabled features from yes/no answers keyed by bundle id. */
export function featuresFromAnswers(
  answers: Record<string, boolean>,
  entityType: string | null | undefined,
): MenuFeature[] {
  const enabled = new Set<MenuFeature>();
  for (const bundle of bundlesFor(entityType)) {
    if (answers[bundle.id] ?? bundle.defaultOn) {
      for (const feature of bundle.features) enabled.add(feature);
    }
  }
  return MENU_FEATURES.filter((f) => enabled.has(f));
}

/** Read yes/no answers posted as `menu_<bundleId>` = "yes" | "no". */
export function menuAnswersFromFormData(
  formData: FormData,
): Record<string, boolean> {
  const answers: Record<string, boolean> = {};
  for (const bundle of MENU_BUNDLES) {
    const value = formData.get(`menu_${bundle.id}`);
    if (value === "yes") answers[bundle.id] = true;
    else if (value === "no") answers[bundle.id] = false;
  }
  return answers;
}

const storedSchema = z.array(z.string());

/**
 * Normalise the stored value. `null` means the person never chose, so every
 * feature shows (e.g. an invited accountant who skipped onboarding).
 */
export function parseEnabledFeatures(raw: unknown): MenuFeature[] | null {
  if (raw == null) return null;
  const parsed = storedSchema.safeParse(raw);
  if (!parsed.success) return null;
  const set = new Set(parsed.data);
  return MENU_FEATURES.filter((f) => set.has(f));
}

export function isFeatureEnabled(
  feature: MenuFeature,
  enabled: readonly MenuFeature[] | null | undefined,
): boolean {
  return enabled == null || enabled.includes(feature);
}

/** Read the per-item checkboxes posted as `feature` (repeated). */
export function featuresFromFormData(formData: FormData): MenuFeature[] {
  const set = new Set(formData.getAll("feature").filter(isMenuFeature));
  return MENU_FEATURES.filter((f) => set.has(f));
}
