import {
  formatDiscountPercent,
  formatMoney,
  formatQuantity,
  hasLineDiscount,
  lineNetPence,
} from "@/lib/money";
import { TOTAL_LABELS, type DesignData } from "@/lib/pdf/designer/fields";
import type { LineItemColumnKey, LineItemsElement } from "@/lib/pdf/designer/schema";
import type { PdfLine } from "@/lib/pdf/templates/types";

/*
 * What the table and totals of a design say. Used by both the PDF renderer
 * and the editor's canvas so they show the same rows.
 */

/** Totals rows a design shows; shared with the editor so both list the same rows. */
export function designTotalsRows(data: DesignData): { label: string; value: string; total: boolean }[] {
  const { netMinor, vatMinor, grossMinor, currency, sterlingVat } = data.document;
  return [
    ...(netMinor != null
      ? [{ label: "Subtotal", value: formatMoney(netMinor, currency), total: false }]
      : []),
    ...(vatMinor > 0 || data.company.vatNumber
      ? [{ label: "VAT", value: formatMoney(vatMinor, currency), total: false }]
      : []),
    ...(sterlingVat ? [{ ...sterlingVat, total: false }] : []),
    { label: TOTAL_LABELS[data.kind], value: formatMoney(grossMinor, currency), total: true },
  ];
}

/** One cell of the line-items table; prices are in the document's `currency`. */
export function lineItemCell(line: PdfLine, key: LineItemColumnKey, currency: string): string {
  switch (key) {
    case "description":
      return line.description;
    case "quantity":
      return formatQuantity(line.quantity);
    case "unitPrice":
      return formatMoney(line.unitPricePence, currency);
    case "discount":
      return formatDiscountPercent(line.discountPercent);
    case "amount":
      return formatMoney(lineNetPence(line), currency);
  }
}

/** The discount column only appears when a line has a discount. */
export function visibleColumns(table: LineItemsElement, lines: PdfLine[]) {
  const columns = hasLineDiscount(lines)
    ? table.columns
    : table.columns.filter((column) => column.key !== "discount");
  return columns.length > 0 ? columns : table.columns;
}
