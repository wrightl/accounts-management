import { safeFilename } from "@/lib/files";

export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

export const ALLOWED_RECEIPT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

/** Detect receipt MIME type from file magic bytes. */
export function sniffReceiptContentType(bytes: Buffer): string | null {
  if (bytes.length < 12) return null;
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") {
    return "application/pdf";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.subarray(0, 4).toString("latin1") === "GIF8") {
    return "image/gif";
  }
  if (
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Prefer sniffed type when the browser sends a missing or wrong MIME type. */
export function resolveReceiptContentType(bytes: Buffer): string | null {
  return sniffReceiptContentType(bytes);
}

export function receiptMagicOk(bytes: Buffer): boolean {
  return resolveReceiptContentType(bytes) !== null;
}

export type ParsedReceiptFile = {
  file: File;
  bytes: Buffer;
  contentType: string;
  filename: string;
};

export type ParseReceiptFail = {
  ok: false;
  error: string;
  fieldErrors: Record<string, string>;
};

function receiptFail(fieldName: string, message: string): ParseReceiptFail {
  return {
    ok: false,
    error: message,
    fieldErrors: { [fieldName]: message },
  };
}

export function parseReceiptFile(
  formData: FormData,
  fieldName = "receipt",
):
  | { ok: true; data: ParsedReceiptFile }
  | ParseReceiptFail {
  const file = formData.get(fieldName);
  if (!(file instanceof File) || file.size === 0) {
    return receiptFail(fieldName, "Choose a receipt file");
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    return receiptFail(fieldName, "Receipt must be under 8 MB");
  }
  const contentType = file.type || "application/octet-stream";
  const allowed =
    ALLOWED_RECEIPT_TYPES.has(contentType) ||
    contentType === "application/octet-stream";
  if (!allowed) {
    return receiptFail(fieldName, "Receipt must be an image or PDF");
  }

  return { ok: true, data: { file, bytes: Buffer.alloc(0), contentType, filename: safeFilename(file.name) } };
}

export async function parseReceiptFileAsync(
  formData: FormData,
  fieldName = "receipt",
):
  Promise<{ ok: true; data: ParsedReceiptFile } | ParseReceiptFail> {
  const parsed = parseReceiptFile(formData, fieldName);
  if (!parsed.ok) return parsed;

  const bytes = Buffer.from(await parsed.data.file.arrayBuffer());
  const contentType = resolveReceiptContentType(bytes);
  if (!contentType) {
    return receiptFail(
      fieldName,
      "Receipt file contents do not match the declared type",
    );
  }

  return {
    ok: true,
    data: { ...parsed.data, bytes, contentType },
  };
}
