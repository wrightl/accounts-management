import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypts secrets kept in the database, such as HMRC OAuth tokens, with
 * AES-256-GCM.
 *
 * Keys come from the environment as base64 of 32 random bytes:
 *   - `SECRET_BOX_KEY`: encrypts new values and decrypts its own.
 *   - `SECRET_BOX_KEY_PREVIOUS` (optional): only decrypts, while values sealed
 *     with an older key are re-sealed. To rotate, move the current key here,
 *     set a new current key, and let values be re-sealed as they are next used.
 *
 * A sealed value is `v1.<key id>.<iv>.<auth tag>.<ciphertext>`, all base64url.
 * The key id is the start of the key's SHA-256, so the right key is found
 * without trying each one. Nothing about the key itself can be read from it.
 *
 * Generate a key with: openssl rand -base64 32
 */

const VERSION = "v1";

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretBoxError";
  }
}

interface Key {
  id: string;
  bytes: Buffer;
}

function parseKey(name: string, raw: string | undefined): Key | null {
  if (!raw?.trim()) return null;
  const bytes = Buffer.from(raw.trim(), "base64");
  if (bytes.length !== 32) {
    throw new SecretBoxError(`${name} must be base64 of 32 bytes (openssl rand -base64 32)`);
  }
  const id = createHash("sha256").update(bytes).digest("base64url").slice(0, 8);
  return { id, bytes };
}

/** The current key and any previous one, read from the environment each call so tests can change them. */
function keys(env: NodeJS.ProcessEnv = process.env): { current: Key | null; all: Key[] } {
  const current = parseKey("SECRET_BOX_KEY", env.SECRET_BOX_KEY);
  const previous = parseKey("SECRET_BOX_KEY_PREVIOUS", env.SECRET_BOX_KEY_PREVIOUS);
  return { current, all: [current, previous].filter((k): k is Key => k !== null) };
}

/** Whether a key is set, so features that store secrets can hide themselves until it is. */
export function secretBoxConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    return keys(env).current !== null;
  } catch {
    return false;
  }
}

export function seal(plaintext: string, env: NodeJS.ProcessEnv = process.env): string {
  const { current } = keys(env);
  if (!current) throw new SecretBoxError("SECRET_BOX_KEY is not set");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", current.bytes, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, current.id, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function open(sealed: string, env: NodeJS.ProcessEnv = process.env): string {
  const parts = sealed.split(".");
  if (parts.length !== 5 || parts[0] !== VERSION) throw new SecretBoxError("Not a sealed value");
  const [, keyId, iv, tag, ciphertext] = parts as [string, string, string, string, string];
  const key = keys(env).all.find((k) => k.id === keyId);
  if (!key) throw new SecretBoxError("The key this value was sealed with is not configured");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key.bytes, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretBoxError("The sealed value could not be opened");
  }
}

/** Whether a sealed value was sealed with an older key and should be sealed again. */
export function needsReseal(sealed: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const { current } = keys(env);
  return current !== null && sealed.split(".")[1] !== current.id;
}
