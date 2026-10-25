/**
 * Load pdf.js with its worker pre-registered. In Node pdf.js otherwise
 * imports `./pdf.worker.mjs` by a computed path, which output file tracing
 * misses, so every PDF fails on Vercel while working locally. The worker
 * module sets `globalThis.pdfjsWorker`, which pdf.js uses instead.
 */
async function loadPdfjs() {
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

/** Extract visible text from every page of a PDF via pdf.js. */
export async function extractPdfText(bytes: Buffer): Promise<string> {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  const parts: string[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    parts.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join("\n"),
    );
  }
  return parts.join("\n\n");
}

/** Rasterise page 1 for Tesseract when the PDF has no text layer. */
export async function renderPdfFirstPagePng(bytes: Buffer): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext("2d");

  await page.render({
    canvas: null,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;
  return canvas.toBuffer("image/png");
}

export function isPdfBytes(bytes: Buffer): boolean {
  return bytes.length >= 5 && bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}
