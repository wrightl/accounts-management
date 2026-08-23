import "server-only";
import { serverEnv } from "@/env";

export interface StoredObject {
  /** Opaque path/key used to reference the object internally. */
  path: string;
  size: number;
  contentType: string | null;
}

/**
 * Transport-agnostic private file storage. Objects are never exposed via a
 * public URL — downloads are streamed through an authorised route handler,
 * so receipts and documents stay access-controlled.
 */
export interface StorageProvider {
  readonly name: string;
  put(path: string, data: Buffer | Uint8Array, contentType?: string): Promise<StoredObject>;
  get(path: string): Promise<{ body: ArrayBuffer; contentType: string | null }>;
  delete(path: string): Promise<void>;
}

let cached: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (cached) return cached;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    cached = new VercelBlobStorage();
    return cached;
  }
  if (serverEnv().NODE_ENV === "production") {
    throw new Error("BLOB_READ_WRITE_TOKEN is required in production");
  }
  cached = new MemoryStorage();
  return cached;
}

/** Dev/test fallback storage held in process memory. */
class MemoryStorage implements StorageProvider {
  readonly name = "memory";
  private store = new Map<string, { data: Uint8Array; contentType: string | null }>();

  async put(path: string, data: Buffer | Uint8Array, contentType?: string) {
    const bytes = new Uint8Array(data);
    this.store.set(path, { data: bytes, contentType: contentType ?? null });
    return { path, size: bytes.byteLength, contentType: contentType ?? null };
  }
  async get(path: string) {
    const entry = this.store.get(path);
    if (!entry) throw new Error(`Object not found: ${path}`);
    return {
      body: entry.data.buffer.slice(
        entry.data.byteOffset,
        entry.data.byteOffset + entry.data.byteLength,
      ) as ArrayBuffer,
      contentType: entry.contentType,
    };
  }
  async delete(path: string) {
    this.store.delete(path);
  }
}

class VercelBlobStorage implements StorageProvider {
  readonly name = "vercel-blob";

  async put(path: string, data: Buffer | Uint8Array, contentType?: string) {
    const { put } = await import("@vercel/blob");
    const token = serverEnv().BLOB_READ_WRITE_TOKEN;
    const blob = await put(path, Buffer.from(data), {
      access: "private",
      addRandomSuffix: true,
      contentType,
      token,
    });
    return {
      path: blob.pathname,
      size: data.byteLength,
      contentType: contentType ?? null,
    };
  }

  async get(path: string) {
    const { get } = await import("@vercel/blob");
    const token = serverEnv().BLOB_READ_WRITE_TOKEN;
    const result = await get(path, { access: "private", token });
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error(`Object not found: ${path}`);
    }
    return {
      body: await new Response(result.stream).arrayBuffer(),
      contentType: result.blob.contentType ?? null,
    };
  }

  async delete(path: string) {
    const { del } = await import("@vercel/blob");
    const token = serverEnv().BLOB_READ_WRITE_TOKEN;
    await del(path, { token });
  }
}
