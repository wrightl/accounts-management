import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
          background: brand.navy,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: 8,
            background: brand.pink,
          }}
        />
        <div
          style={{
            width: 12,
            height: 3,
            borderRadius: 2,
            background: brand.periwinkle,
          }}
        />
      </div>
    ),
    { ...size },
  );
}
