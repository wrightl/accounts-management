/**
 * Draw the first page of every library template (each as an invoice, a credit
 * note and a quote) into public/invoice-templates/, for the template picker.
 *
 * Usage: npm run templates:thumbnails
 * Pass --pdf to also keep the PDFs (in the scratch directory given by --out=).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { renderPdfFirstPagePng } from "../src/lib/expenses/receipt-pdf";
import { DOCUMENT_KINDS, TEMPLATES } from "../src/lib/pdf/templates/registry";
import { renderSampleTemplatePdf } from "../src/lib/pdf/templates/render";
import { SAMPLE_COMPANY } from "../src/lib/pdf/templates/sample";

/** A plain placeholder mark, so the pictures show where a logo goes. */
function sampleLogo(): string {
  const size = 240;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 120px Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("H", size / 2, size / 2 + 6);
  return `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`;
}

async function main() {
  const outDir = join(process.cwd(), "public/invoice-templates");
  mkdirSync(outDir, { recursive: true });
  const pdfDir = process.argv.find((arg) => arg.startsWith("--out="))?.slice("--out=".length);
  if (pdfDir) mkdirSync(pdfDir, { recursive: true });
  const logoSrc = sampleLogo();

  for (const template of TEMPLATES) {
    for (const kind of DOCUMENT_KINDS) {
      const pdf = await renderSampleTemplatePdf({
        templateKey: template.key,
        kind,
        company: SAMPLE_COMPANY,
        logoSrc,
      });
      const name = `${template.key}-${kind}`;
      if (pdfDir) writeFileSync(join(pdfDir, `${name}.pdf`), pdf);
      writeFileSync(join(outDir, `${name}.png`), await renderPdfFirstPagePng(Buffer.from(pdf)));
      console.log(`wrote ${name}.png`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
