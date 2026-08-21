import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          background: brand.navy,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 36,
            background: brand.pink,
          }}
        />
        <div
          style={{
            width: 56,
            height: 14,
            borderRadius: 14,
            background: brand.periwinkle,
          }}
        />
      </div>
    ),
    { ...size },
  );
}
