import "server-only";
import { createHash } from "node:crypto";

/** Fingerprint of a receipt file, for spotting the same one uploaded twice. */
export function receiptSha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
