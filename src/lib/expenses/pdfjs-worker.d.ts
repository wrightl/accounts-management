// pdfjs-dist ships no types for the worker entry; it is imported only for
// its side effect of setting `globalThis.pdfjsWorker` (see receipt-pdf.ts).
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
