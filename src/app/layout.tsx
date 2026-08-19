import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { isAuthConfigured } from "@/env";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Substitute for the site's Adobe Fonts "roc-grotesk"; swap in the licensed
// Typekit family later by replacing this loader.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Dot + Dash Consulting — Accounts",
  description:
    "Invoicing, expenses, reimbursements and reporting for Dot + Dash Consulting.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const body = (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );

  // Only mount Clerk when it is configured, so the app builds and runs (public
  // pages, tests) before credentials are added. Once the Clerk env vars exist,
  // the provider wraps the whole tree and auth is fully active.
  if (!isAuthConfigured()) {
    return body;
  }

  return <ClerkProvider afterSignOutUrl="/">{body}</ClerkProvider>;
}
