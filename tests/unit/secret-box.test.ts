import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { needsReseal, open, seal, SecretBoxError, secretBoxConfigured } = await import("@/lib/crypto/secret-box");

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");
const envA = { SECRET_BOX_KEY: KEY_A } as NodeJS.ProcessEnv;

describe("secret box", () => {
  it("seals and opens a value, never storing it in the clear", () => {
    const sealed = seal("hmrc-access-token", envA);
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain("hmrc-access-token");
    expect(open(sealed, envA)).toBe("hmrc-access-token");
    expect(seal("hmrc-access-token", envA)).not.toBe(sealed);
  });

  it("refuses a tampered value", () => {
    const parts = seal("secret", envA).split(".");
    const ciphertext = Buffer.from(parts[4]!, "base64url");
    ciphertext[0] = ciphertext[0]! ^ 1;
    parts[4] = ciphertext.toString("base64url");
    expect(() => open(parts.join("."), envA)).toThrow(SecretBoxError);
    expect(() => open("not sealed", envA)).toThrow("Not a sealed value");
  });

  it("opens values sealed with the previous key during a rotation, and says they need resealing", () => {
    const old = seal("secret", envA);
    const rotated = { SECRET_BOX_KEY: KEY_B, SECRET_BOX_KEY_PREVIOUS: KEY_A } as NodeJS.ProcessEnv;
    expect(open(old, rotated)).toBe("secret");
    expect(needsReseal(old, rotated)).toBe(true);
    expect(needsReseal(seal("secret", rotated), rotated)).toBe(false);
    expect(() => open(old, { SECRET_BOX_KEY: KEY_B } as NodeJS.ProcessEnv)).toThrow("not configured");
  });

  it("needs a 32-byte key", () => {
    expect(secretBoxConfigured({} as NodeJS.ProcessEnv)).toBe(false);
    expect(secretBoxConfigured({ SECRET_BOX_KEY: "short" } as NodeJS.ProcessEnv)).toBe(false);
    expect(secretBoxConfigured(envA)).toBe(true);
    expect(() => seal("x", {} as NodeJS.ProcessEnv)).toThrow("SECRET_BOX_KEY is not set");
    expect(() => seal("x", { SECRET_BOX_KEY: "short" } as NodeJS.ProcessEnv)).toThrow("32 bytes");
  });
});
