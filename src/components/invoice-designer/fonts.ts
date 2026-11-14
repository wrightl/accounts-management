import localFont from "next/font/local";

/**
 * Poppins from the same files the PDF renderer uses, so text measures the
 * same on the page and in the PDF. Put `designPoppins.variable` on an
 * ancestor of anything that draws a design.
 */
export const designPoppins = localFont({
  src: [
    { path: "../../lib/pdf/fonts/Poppins-Regular.ttf", weight: "400" },
    { path: "../../lib/pdf/fonts/Poppins-Bold.ttf", weight: "700" },
  ],
  variable: "--font-design-poppins",
  display: "swap",
});
