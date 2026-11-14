"use client";

import { createContext, useContext } from "react";
import type { DocumentKind } from "@/lib/pdf/templates/registry";

/** The kind of document the open design is for; decides which details can be placed. */
export const DesignKindContext = createContext<DocumentKind>("invoice");

export function useDesignKind(): DocumentKind {
  return useContext(DesignKindContext);
}
