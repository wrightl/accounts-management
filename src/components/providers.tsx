"use client";

import { AlertProvider } from "@/components/ui/alert-dialog";
import { Toaster } from "@/components/ui/toast";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AlertProvider>
      {children}
      <Toaster />
    </AlertProvider>
  );
}
