import type { NextConfig } from 'next';
import { clerkFrontendApiHost } from './src/lib/clerk-frontend-api';

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
    'https://challenges.cloudflare.com https://*.protect.clerk.com';

const cspDirectives = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "form-action 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://va.vercel-scripts.com ${clerkCsp}${clerkHost ? ` https://${clerkHost}` : ''}`,
    `connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://*.clerk.services https://*.protect.clerk.com:* https://api.resend.com https://*.blob.vercel-storage.com https://va.vercel-scripts.com https://vitals.vercel-insights.com${clerkHost ? ` https://${clerkHost}` : ''}`,
    `img-src 'self' data: blob: https://*.clerk.com https://img.clerk.com https://*.blob.vercel-storage.com`,
    `style-src 'self' 'unsafe-inline'`,
    `font-src 'self' data:`,
    `frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com ${clerkCsp}${clerkHost ? ` https://${clerkHost}` : ''}`,
    "worker-src 'self' blob:",
].join('; ');

const securityHeaders = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-DNS-Prefetch-Control', value: 'off' },
    {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
    },
    {
        key: 'Permissions-Policy',
        value: 'camera=(self), microphone=(), geolocation=()',
    },
    { key: 'Content-Security-Policy', value: cspDirectives },
];

/** Routes the app frames itself: receipt previews and the stored email body. */
const FRAMEABLE_PATHS = ['api/receipts/[^/]+', 'api/expenses/[^/]+/email-body'];

const nextConfig: NextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    devIndicators: { position: 'bottom-right' },
    serverExternalPackages: [
        'pdfjs-dist',
        '@napi-rs/canvas',
        '@vercel/blob',
        '@vercel/oidc',
        'pg',
        'tesseract.js',
    ],
    // tesseract.js runs OCR in a worker thread started from a file path, so
    // tracing ships worker-script/node/index.js but none of its requires.
    // OCR is reachable from server actions on any page, hence every route.
    outputFileTracingIncludes: {
        '/**': [
            './node_modules/tesseract.js/src/**/*',
            './node_modules/tesseract.js-core/**/*',
            './node_modules/wasm-feature-detect/**/*',
            './node_modules/regenerator-runtime/**/*',
            './node_modules/bmp-js/**/*',
            './node_modules/is-url/**/*',
            './node_modules/zlibjs/**/*',
            './node_modules/idb-keyval/**/*',
            './node_modules/node-fetch/**/*',
            './node_modules/whatwg-url/**/*',
            './node_modules/tr46/**/*',
            './node_modules/webidl-conversions/**/*',
        ],
    },
    ...(devOrigin ? { allowedDevOrigins: [devOrigin] } : {}),
    experimental: {
        serverActions: {
            bodySizeLimit: '10mb',
        },
    },
    async headers() {
        return [
            {
                source: `/((?!(?:${FRAMEABLE_PATHS.join('|')})$).*)`,
                headers: securityHeaders,
            },
            // Framed by the expense page. These routes set their own
            // Content-Security-Policy and X-Frame-Options (same origin only).
            {
                source: `/(${FRAMEABLE_PATHS.join('|')})`,
                headers: securityHeaders.filter(
                    (h) =>
                        h.key !== 'Content-Security-Policy' &&
                        h.key !== 'X-Frame-Options',
                ),
            },
        ];
    },
    async redirects() {
        return [
            {
                source: '/dashboard/:path+',
                destination: '/:path+',
                permanent: true,
            },
        ];
    },
};

export default nextConfig;
