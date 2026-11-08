"use client";

import { FreshSession } from "@/components/auth/fresh-session";
import { AlertProvider } from "@/components/ui/alert-dialog";
import { Toaster } from "@/components/ui/toast";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AlertProvider>
      <FreshSession />
      {children}
      <Toaster />
    </AlertProvider>
  );
}
