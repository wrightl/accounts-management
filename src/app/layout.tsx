import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { brand } from "@/lib/brand";
import { PRODUCT_LOCKUP, PRODUCT_TAGLINE, MAKER_DISPLAY } from "@/lib/product";
import { AppProviders } from "@/components/providers";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: `${PRODUCT_LOCKUP} — ${PRODUCT_TAGLINE}`,
    template: `%s — ${PRODUCT_LOCKUP}`,
  },
  description:
    "Accounting software built specifically for UK limited companies and sole traders. Manage quotes, invoices, expenses, reimbursements, bank reconciliation, VAT, and reporting. Perfect for UK consultancies, studios, and small agencies. Replace spreadsheets with integrated bookkeeping.",
  applicationName: PRODUCT_LOCKUP,
  keywords: [
    "UK accounting software",
    "UK bookkeeping",
    "limited company accounting",
    "sole trader accounting",
    "UK consultancy accounting",
    "UK freelancer invoicing",
    "UK small business",
  ],
  authors: [{ name: MAKER_DISPLAY }],
  creator: MAKER_DISPLAY,
  publisher: MAKER_DISPLAY,
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://accounts-manager.dotanddashconsulting.com"),
  openGraph: {
    type: "website",
    locale: "en_GB",
    siteName: PRODUCT_LOCKUP,
  },
  twitter: {
    card: "summary_large_image",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: brand.periwinkle,
};

const clerkAppearance = {
  variables: {
    colorPrimary: brand.navy,
    colorText: brand.navy,
    colorBackground: brand.white,
    colorInputText: brand.navy,
    borderRadius: "0.75rem",
    fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif",
  },
  elements: {
    card: {
      boxShadow: "none",
      border: "1px solid rgb(23 29 58 / 0.12)",
      borderRadius: "1rem",
    },
    formButtonPrimary: {
      backgroundColor: brand.pink,
      color: brand.navy,
      borderRadius: "999px",
      textTransform: "none" as const,
    },
    footerActionLink: {
      color: brand.navy,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const body = (
    <html lang="en" className={`${outfit.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <AppProviders>{children}</AppProviders>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );

  return (
    <ClerkProvider
      afterSignOutUrl="/"
      signInForceRedirectUrl="/dashboard"
      signUpForceRedirectUrl="/onboarding"
      appearance={clerkAppearance}
    >
      {body}
    </ClerkProvider>
  );
}
