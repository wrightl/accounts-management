import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";

export const alt = "Dot + Dash Consulting — Accounts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const logo = await readFile(join(process.cwd(), "public/brand/logo.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: brand.navy,
          color: brand.white,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <img src={logoSrc} width={112} height={112} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 36, letterSpacing: -0.5 }}>
              Dot + Dash Consulting
            </div>
            <div style={{ marginTop: 8, fontSize: 22, color: brand.pink }}>
              Accounts
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: 48,
            fontSize: 64,
            lineHeight: 1.1,
            letterSpacing: -1.5,
            maxWidth: 900,
          }}
        >
          Your books, in one place.
        </div>
      </div>
    ),
    { ...size },
  );
}
