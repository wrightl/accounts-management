import type { NextConfig } from "next";
import { clerkFrontendApiHost } from "./src/lib/clerk-frontend-api";

const clerkHost = clerkFrontendApiHost();

/** Hostname from NEXT_PUBLIC_APP_URL — allows ngrok/tunnel origins in dev. */
function appDevOrigin(): string | null {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const devOrigin = appDevOrigin();

const clerkCsp =
  "https://challenges.cloudflare.com https://*.protect.clerk.com";

const cspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com ${clerkCsp}${clerkHost ? ` https://${clerkHost}` : ""}`,
  `connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://*.clerk.services https://*.protect.clerk.com:* https://api.resend.com https://*.blob.vercel-storage.com${clerkHost ? ` https://${clerkHost}` : ""}`,
  `img-src 'self' data: blob: https://*.clerk.com https://img.clerk.com https://*.blob.vercel-storage.com`,
  `style-src 'self' 'unsafe-inline'`,
  `font-src 'self' data:`,
  `frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com ${clerkCsp}${clerkHost ? ` https://${clerkHost}` : ""}`,
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
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: cspDirectives },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: [
    "pdfjs-dist",
    "@napi-rs/canvas",
    "@vercel/blob",
    "@vercel/oidc",
  ],
  ...(devOrigin ? { allowedDevOrigins: [devOrigin] } : {}),
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
