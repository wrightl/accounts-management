import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";

export const alt = "Dot + Dash Consulting — Accounts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
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
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 22,
              background: brand.pink,
            }}
          />
          <div
            style={{
              width: 40,
              height: 8,
              borderRadius: 8,
              background: brand.periwinkle,
            }}
          />
          <div style={{ fontSize: 36, letterSpacing: -0.5 }}>
            Dot + Dash Consulting
          </div>
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 64,
            lineHeight: 1.1,
            letterSpacing: -1.5,
            maxWidth: 900,
          }}
        >
          Your books, in one place.
        </div>
        <div style={{ marginTop: 20, fontSize: 28, color: brand.pink }}>
          Accounts
        </div>
      </div>
    ),
    { ...size },
  );
}
