import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { isAuthConfigured } from "@/env";
import { brand } from "@/lib/brand";
import { AppProviders } from "@/components/providers";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Dot + Dash Consulting — Accounts",
    template: "%s — Dot + Dash Accounts",
  },
  description:
    "Invoicing, expenses, reimbursements and reporting for Dot + Dash Consulting.",
  applicationName: "Dot + Dash Accounts",
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
      </body>
    </html>
  );

  if (!isAuthConfigured()) {
    return body;
  }

  return (
    <ClerkProvider afterSignOutUrl="/" appearance={clerkAppearance}>
      {body}
    </ClerkProvider>
  );
}
