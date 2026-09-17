import "server-only";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

export const PDF_FONT_FAMILY = "Outfit";

let registered = false;
let outfitAvailable = false;

/**
 * Register Outfit for @react-pdf (idempotent). Falls back to Helvetica when
 * the vendored TTFs are missing or registration fails.
 */
export function registerPdfFonts(): string {
  if (registered) return outfitAvailable ? PDF_FONT_FAMILY : "Helvetica";

  registered = true;
  try {
    const dir = path.join(process.cwd(), "src/lib/pdf/fonts");
    Font.register({
      family: PDF_FONT_FAMILY,
      fonts: [
        { src: path.join(dir, "Outfit-Regular.ttf"), fontWeight: 400 },
        { src: path.join(dir, "Outfit-SemiBold.ttf"), fontWeight: 600 },
      ],
    });
    outfitAvailable = true;
    return PDF_FONT_FAMILY;
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "pdf_font_register_failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    outfitAvailable = false;
    return "Helvetica";
  }
}
