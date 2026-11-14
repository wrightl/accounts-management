import "server-only";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

export const PDF_FONT_FAMILY = "Outfit";

/** Vendored families (src/lib/pdf/fonts) and the weights each ships. */
const VENDORED_FONTS = {
  Outfit: [
    { file: "Outfit-Regular.ttf", fontWeight: 400 },
    { file: "Outfit-SemiBold.ttf", fontWeight: 600 },
  ],
  Poppins: [
    { file: "Poppins-Regular.ttf", fontWeight: 400 },
    { file: "Poppins-Medium.ttf", fontWeight: 500 },
    { file: "Poppins-SemiBold.ttf", fontWeight: 600 },
    { file: "Poppins-Bold.ttf", fontWeight: 700 },
  ],
} as const;

export type VendoredPdfFont = keyof typeof VENDORED_FONTS;

// Break lines between words only: hyphenating splits email addresses and
// reference numbers mid-way.
Font.registerHyphenationCallback((word) => [word]);

const registered = new Map<VendoredPdfFont, boolean>();

/**
 * Register a vendored family for @react-pdf (idempotent) and return the name
 * to use. Falls back to Helvetica when the TTFs are missing or registration
 * fails.
 */
export function pdfFont(family: VendoredPdfFont): string {
  const known = registered.get(family);
  if (known !== undefined) return known ? family : "Helvetica";

  try {
    const dir = path.join(process.cwd(), "src/lib/pdf/fonts");
    Font.register({
      family,
      fonts: VENDORED_FONTS[family].map(({ file, fontWeight }) => ({
        src: path.join(dir, file),
        fontWeight,
      })),
    });
    registered.set(family, true);
    return family;
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "pdf_font_register_failed",
        family,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    registered.set(family, false);
    return "Helvetica";
  }
}

/** Register Outfit, the default document font. */
export function registerPdfFonts(): string {
  return pdfFont(PDF_FONT_FAMILY);
}
