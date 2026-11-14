import type { ComponentType } from "react";
import type { TemplateKey } from "@/lib/pdf/templates/registry";
import type { TemplateLayoutProps } from "@/lib/pdf/templates/types";
import { BoldLayout } from "@/lib/pdf/templates/layouts/bold";
import { ClassicLayout } from "@/lib/pdf/templates/layouts/classic";
import { CorporateLayout } from "@/lib/pdf/templates/layouts/corporate";
import { MinimalLayout } from "@/lib/pdf/templates/layouts/minimal";
import { ModernLayout } from "@/lib/pdf/templates/layouts/modern";

export const TEMPLATE_LAYOUTS: Record<TemplateKey, ComponentType<TemplateLayoutProps>> = {
  modern: ModernLayout,
  classic: ClassicLayout,
  minimal: MinimalLayout,
  corporate: CorporateLayout,
  bold: BoldLayout,
};
