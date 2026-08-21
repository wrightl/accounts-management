import type { NextConfig } from "next";

// Clerk frontend API host is derived from the publishable key (base64 payload).
function clerkFrontendApi(): string | null {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!key?.startsWith("pk_")) return null;
  try {
    const payload = key.split("_").slice(1).join("_");
    // Clerk pk_test_<base64> encodes the frontend API hostname.
    const decoded = Buffer.from(payload, "base64").toString("utf8").replace(/\$+$/, "");
    if (decoded.includes(".")) return decoded;
  } catch {
    /* ignore */
  }
  return null;
}

const clerkHost = clerkFrontendApi();

const cspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com${clerkHost ? ` https://${clerkHost}` : ""}`,
  `connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://*.clerk.services https://api.resend.com https://*.blob.vercel-storage.com${clerkHost ? ` https://${clerkHost}` : ""}`,
  `img-src 'self' data: blob: https://*.clerk.com https://img.clerk.com https://*.blob.vercel-storage.com`,
  `style-src 'self' 'unsafe-inline'`,
  `font-src 'self' data:`,
  `frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com${clerkHost ? ` https://${clerkHost}` : ""}`,
  "worker-src 'self' blob:",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: cspDirectives },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
