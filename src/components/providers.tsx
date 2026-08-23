"use client";

import { AlertProvider } from "@/components/ui/alert-dialog";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <AlertProvider>{children}</AlertProvider>;
}
