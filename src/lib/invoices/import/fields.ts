export const IMPORT_FIELDS = {
  number: { label: "Invoice number", aliases: ["number", "invoice number", "invoice no", "invoice"] },
  issueDate: { label: "Issue date", aliases: ["issue date", "invoice date", "date"] },
  dueDate: { label: "Due date", aliases: ["due date"] },
  status: { label: "Status", aliases: ["status"] },
  currency: { label: "Currency", aliases: ["currency", "currency code"] },
  clientName: { label: "Client name", aliases: ["client name", "client", "customer", "customer name", "contact", "contact name", "name"] },
  clientCompany: { label: "Client company", aliases: ["client company", "company", "company name"] },
  clientEmail: { label: "Client email", aliases: ["client email", "email", "email address"] },
  clientAddress: { label: "Client address", aliases: ["client address", "address"] },
  description: { label: "Line description", aliases: ["description", "item description", "desc", "details"] },
  quantity: { label: "Line quantity", aliases: ["quantity", "qty"] },
  unitPrice: { label: "Line unit price", aliases: ["unit price", "unit amount", "rate", "price"] },
  discount: { label: "Line discount %", aliases: ["discount", "discount percent", "discount %"] },
  lineNet: { label: "Line net amount", aliases: ["line net", "line amount", "line net gbp"] },
  lineVat: { label: "Line VAT amount", aliases: ["line vat", "line vat gbp", "line tax", "tax amount"] },
  vatRate: { label: "Line VAT rate %", aliases: ["vat rate", "tax rate"] },
  net: { label: "Invoice net total", aliases: ["net", "net gbp", "net total", "subtotal"] },
  vat: { label: "Invoice VAT total", aliases: ["vat", "vat gbp", "vat total", "total vat", "tax"] },
  gross: { label: "Invoice gross total", aliases: ["gross", "gross gbp", "total", "invoice total"] },
  amountPaid: { label: "Amount paid", aliases: ["amount paid", "amount paid gbp", "paid"] },
  amountDue: { label: "Amount still due", aliases: ["amount due", "balance", "open balance", "outstanding"] },
  paidDate: { label: "Paid date", aliases: ["paid date", "paid at", "payment date", "date paid"] },
  paymentReference: { label: "Payment reference", aliases: ["payment reference", "payment ref"] },
} as const;

export type ImportField = keyof typeof IMPORT_FIELDS;
export type ColumnMapping = Partial<Record<ImportField, string>>;
export type ImportDateFormat = "dmy" | "mdy";

/**
 * Deliberately leaves ambiguous headers such as "Amount" and "Reference"
 * unmapped: the first could be net or gross, and the second is an invoice
 * reference in some systems and a payment reference in others.
 */
export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normalized = headers.map((h) =>
    h.trim().toLowerCase().replace(/[_\s]+/g, " "),
  );
  for (const [field, { aliases }] of Object.entries(IMPORT_FIELDS)) {
    for (const alias of aliases) {
      const index = normalized.indexOf(alias);
      if (index >= 0) {
        mapping[field as ImportField] = headers[index];
        break;
      }
    }
  }
  return mapping;
}

export const INVOICE_IMPORT_TEMPLATE_CSV = `invoice number,client name,client company,client email,issue date,due date,description,quantity,unit price,vat rate,status,amount paid,paid date,payment reference
INV-0041,Jane Smith,Acme Ltd,jane@acme.example,15/04/2026,29/04/2026,April retainer,1,1000.00,20,sent,,,
INV-0042,Bob Lee,Studio Co,bob@studio.example,01/05/2026,15/05/2026,Website redesign,1,2500.00,20,paid,3120.00,10/05/2026,BANK-1
INV-0042,Bob Lee,Studio Co,bob@studio.example,01/05/2026,15/05/2026,Hosting,12,10.00,0,paid,3120.00,10/05/2026,BANK-1
`;
