import { describe, it, expect } from "vitest";
import { postgresConnectionString } from "@/db/connection-string";

describe("postgresConnectionString", () => {
  it("upgrades Neon sslmode=require to verify-full without touching credentials", () => {
    expect(
      postgresConnectionString(
        "postgresql://user:p%40ss@ep-x.aws.neon.tech/neondb?sslmode=require",
      ),
    ).toBe(
      "postgresql://user:p%40ss@ep-x.aws.neon.tech/neondb?sslmode=verify-full",
    );
  });

  it("keeps extra query params when rewriting aliased modes", () => {
    expect(
      postgresConnectionString(
        "postgresql://u:p@host/db?sslmode=prefer&channel_binding=require",
      ),
    ).toBe(
      "postgresql://u:p@host/db?sslmode=verify-full&channel_binding=require",
    );
  });

  it("leaves verify-full, disable, and urls without sslmode unchanged", () => {
    expect(
      postgresConnectionString(
        "postgresql://u:p@host/db?sslmode=verify-full",
      ),
    ).toBe("postgresql://u:p@host/db?sslmode=verify-full");
    expect(
      postgresConnectionString("postgresql://u:p@host/db?sslmode=disable"),
    ).toBe("postgresql://u:p@host/db?sslmode=disable");
    expect(postgresConnectionString("postgresql://u:p@host/db")).toBe(
      "postgresql://u:p@host/db",
    );
  });

  it("does not rewrite urls that opted into libpq sslmode semantics", () => {
    const url =
      "postgresql://u:p@host/db?uselibpqcompat=true&sslmode=require";
    expect(postgresConnectionString(url)).toBe(url);
  });
});
