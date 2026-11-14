import type {
  DesignElement,
  LineItemsElement,
  ShapeElement,
  TemplateDesign,
  TextElement,
  TotalsElement,
} from "@/lib/pdf/designer/schema";
import type { DocumentKind } from "@/lib/pdf/templates/views";

/*
 * Designs a new template can start from. Each is an ordinary design the user
 * then changes freely.
 */

type Box = { x: number; y: number; w: number; h: number };

function text(id: string, box: Box, content: string, style: Partial<TextElement> = {}): TextElement {
  return {
    id,
    type: "text",
    ...box,
    repeat: false,
    content,
    fontFamily: "Outfit",
    fontSize: 10,
    bold: false,
    colour: "#111827",
    align: "left",
    lineHeight: 1.4,
    letterSpacing: 0,
    uppercase: false,
    fill: null,
    padding: 0,
    ...style,
  };
}

function rect(id: string, box: Box, fill: string, style: Partial<ShapeElement> = {}): ShapeElement {
  return {
    id,
    type: "shape",
    ...box,
    repeat: false,
    shape: "rect",
    fill,
    stroke: null,
    strokeWidth: 1,
    radius: 0,
    ...style,
  };
}

function table(box: Box, style: Partial<LineItemsElement> = {}): LineItemsElement {
  return {
    id: "line-items",
    type: "lineItems",
    ...box,
    repeat: false,
    columns: [
      { key: "description", label: "Description", width: 50 },
      { key: "quantity", label: "Qty", width: 10 },
      { key: "unitPrice", label: "Unit", width: 20 },
      { key: "amount", label: "Amount", width: 20 },
    ],
    fontFamily: "Outfit",
    fontSize: 10,
    headerFill: null,
    headerColour: "#6b7280",
    headerBold: true,
    rowColour: "#111827",
    stripeFill: null,
    ruleColour: "#e5e7eb",
    cellPadding: 8,
    ...style,
  };
}

function totals(box: Box, style: Partial<TotalsElement> = {}): TotalsElement {
  return {
    id: "totals",
    type: "totals",
    ...box,
    repeat: false,
    fontFamily: "Outfit",
    fontSize: 10,
    colour: "#4b5563",
    totalFill: null,
    totalColour: "#111827",
    totalBold: true,
    rowPadding: 5,
    ...style,
  };
}

const BANK_DETAILS =
  "{{bank.name}}\nAccount name: {{bank.accountName}}\nSort code: {{bank.sortCode}}\nAccount number: {{bank.accountNumber}}";

/** What a starter says for each kind of document; the layout is the same for all three. */
interface StarterWording {
  title: string;
  number: string;
  /** "Issued …" and the second date or reference, one per line. */
  dates: string;
  /** The same, with the number, as the Bold starter's labelled list. */
  meta: string;
  recipientLabel: string;
  detailTitle: string;
  detail: string;
  /** A line under the detail block, or null. */
  detailNote: string | null;
  notesTitle: string;
  notes: string;
}

const WORDING: Record<DocumentKind, StarterWording> = {
  invoice: {
    title: "Invoice",
    number: "{{invoice.number}}",
    dates: "Issued {{invoice.issueDate}}\nDue {{invoice.dueDate}}",
    meta: "Invoice No : {{invoice.number}}\nInvoice Date: {{invoice.issueDate}}\nDue Date: {{invoice.dueDate}}",
    recipientLabel: "Bill to",
    detailTitle: "Payment details",
    detail: BANK_DETAILS,
    detailNote: "Please quote {{invoice.number}} as the payment reference.",
    notesTitle: "Terms and Conditions",
    notes: "{{invoice.notes}}",
  },
  quote: {
    title: "Quote",
    number: "{{quote.number}}",
    dates: "Issued {{quote.issueDate}}\nValid until {{quote.validUntil}}",
    meta: "Quote No : {{quote.number}}\nQuote Date: {{quote.issueDate}}\nValid Until: {{quote.validUntil}}",
    recipientLabel: "Quoted to",
    detailTitle: "Validity",
    detail: "This quote is valid until {{quote.validUntil}}.",
    detailNote: null,
    notesTitle: "Terms and Conditions",
    notes: "{{quote.terms}}",
  },
  "credit-note": {
    title: "Credit note",
    number: "{{creditNote.number}}",
    dates: "Issued {{creditNote.issueDate}}\nCredits invoice {{creditNote.invoiceNumber}}",
    meta: "Credit Note No : {{creditNote.number}}\nCredit Note Date: {{creditNote.issueDate}}\nCredits Invoice: {{creditNote.invoiceNumber}}",
    recipientLabel: "Credited to",
    detailTitle: "Reason for credit",
    detail: "{{creditNote.reason}}",
    detailNote: null,
    notesTitle: "",
    notes: "",
  },
};

function blank(): TemplateDesign {
  return {
    version: 1,
    page: { background: "#ffffff", marginTop: 40, marginBottom: 40 },
    elements: [
      table({ x: 40, y: 300, w: 515, h: 110 }),
      totals({ x: 355, y: 425, w: 200, h: 80 }),
    ],
  };
}

function clean(kind: DocumentKind): TemplateDesign {
  const words = WORDING[kind];
  const muted = "#6b7280";
  const label: Partial<TextElement> = {
    fontSize: 8,
    colour: muted,
    uppercase: true,
    letterSpacing: 1,
  };
  const elements: DesignElement[] = [
    { id: "logo", type: "image", x: 40, y: 40, w: 56, h: 56, repeat: false, source: { kind: "logo" }, fit: "contain" },
    text("business", { x: 40, y: 106, w: 280, h: 20 }, "{{company.name}}", { fontSize: 14, bold: true }),
    text("title", { x: 335, y: 40, w: 220, h: 36 }, words.title, { fontSize: 26, align: "right" }),
    text("number", { x: 335, y: 80, w: 220, h: 16 }, words.number, { align: "right", colour: muted }),
    rect("rule", { x: 40, y: 146, w: 515, h: 1 }, "#111827"),
    text("bill-to-label", { x: 40, y: 164, w: 200, h: 12 }, words.recipientLabel, label),
    text("client", { x: 40, y: 180, w: 260, h: 80 }, "{{client.name}}\n{{client.address}}\n{{client.email}}"),
    text("dates-label", { x: 355, y: 164, w: 200, h: 12 }, "Dates", { ...label, align: "right" }),
    text("dates", { x: 355, y: 180, w: 200, h: 32 }, words.dates, {
      align: "right",
    }),
    table({ x: 40, y: 290, w: 515, h: 110 }),
    totals({ x: 355, y: 415, w: 200, h: 80 }),
    text("payment-label", { x: 40, y: 520, w: 200, h: 12 }, words.detailTitle, label),
    text(
      "payment",
      { x: 40, y: 536, w: 320, h: 84 },
      words.detailNote ? `${words.detail}\n${words.detailNote}` : words.detail,
    ),
    ...(words.notes
      ? [text("notes", { x: 40, y: 640, w: 515, h: 40 }, words.notes, { colour: muted, fontSize: 9 })]
      : []),
    text("footer", { x: 40, y: 808, w: 515, h: 12 }, "{{company.legalName}} · {{company.email}}", {
      fontSize: 7.5,
      colour: muted,
      repeat: true,
    }),
  ];
  return {
    version: 1,
    page: { background: "#ffffff", marginTop: 40, marginBottom: 50 },
    elements,
  };
}

function bold(kind: DocumentKind): TemplateDesign {
  const words = WORDING[kind];
  const pink = "#ff66c4";
  const blue = "#0038d1";
  const soft = "#5b5b5b";
  const body: Partial<TextElement> = { fontFamily: "Poppins", fontSize: 9.5, colour: "#2b2b2b", lineHeight: 1.6 };
  const elements: DesignElement[] = [
    rect("top-bar", { x: 0, y: 0, w: 595, h: 30 }, pink, { repeat: true }),
    rect("bottom-bar", { x: 0, y: 816, w: 595, h: 26 }, blue, { repeat: true }),
    rect("logo-tile", { x: 495, y: 10, w: 82, h: 82 }, blue),
    { id: "logo", type: "image", x: 504, y: 19, w: 64, h: 64, repeat: false, source: { kind: "logo" }, fit: "contain" },
    text("title", { x: 44, y: 40, w: 400, h: 48 }, words.title, {
      fontFamily: "Poppins",
      fontSize: 34,
      bold: true,
      colour: "#111111",
      uppercase: true,
      lineHeight: 1.2,
    }),
    text(
      "meta",
      { x: 68, y: 112, w: 240, h: 48 },
      words.meta,
      { ...body, colour: "#111111" },
    ),
    text("invoiced-to", { x: 68, y: 176, w: 240, h: 16 }, `${kind === "invoice" ? "Invoiced to" : words.recipientLabel} :`, {
      ...body,
      bold: true,
      colour: "#111111",
      uppercase: true,
    }),
    text("client", { x: 68, y: 194, w: 250, h: 96 }, "{{client.name}}\n{{client.address}}\n{{client.email}}", body),
    text(
      "sender",
      { x: 324, y: 112, w: 230, h: 130 },
      "{{company.legalName}}\n{{company.address}}\n\n{{company.email}}\nCompany no: {{company.number}}",
      body,
    ),
    table(
      { x: 68, y: 320, w: 459, h: 130 },
      {
        columns: [
          { key: "description", label: "Description", width: 70 },
          { key: "amount", label: "Total", width: 30 },
        ],
        fontFamily: "Poppins",
        fontSize: 9.5,
        headerFill: blue,
        headerColour: "#ffffff",
        rowColour: "#2b2b2b",
        ruleColour: null,
        cellPadding: 10,
      },
    ),
    rect("table-rule", { x: 68, y: 462, w: 459, h: 1 }, "#111111"),
    totals(
      { x: 327, y: 476, w: 200, h: 90 },
      {
        fontFamily: "Poppins",
        fontSize: 9.5,
        colour: "#2b2b2b",
        totalFill: blue,
        totalColour: "#ffffff",
        rowPadding: 6,
      },
    ),
    text("payment-title", { x: 64, y: 590, w: 240, h: 16 }, kind === "invoice" ? "Payment Method" : words.detailTitle, {
      ...body,
      fontSize: 10,
      colour: "#111111",
    }),
    text(
      "payment",
      { x: 64, y: 608, w: 320, h: 64 },
      kind === "invoice"
        ? "Bank Name : {{bank.name}}\nAccount Name: {{bank.accountName}}\nAccount No : {{bank.accountNumber}}\nSort code: {{bank.sortCode}}"
        : words.detail,
      { ...body, colour: soft },
    ),
    ...(kind === "invoice"
      ? [
          text("reference", { x: 64, y: 684, w: 420, h: 16 }, "Please use the invoice number as payment reference", {
            ...body,
            colour: soft,
          }),
        ]
      : []),
    ...(words.notes
      ? [
          text("terms-title", { x: 64, y: 716, w: 240, h: 16 }, words.notesTitle, {
            ...body,
            fontSize: 10,
            colour: "#111111",
          }),
          text("terms", { x: 64, y: 734, w: 460, h: 40 }, words.notes, { ...body, colour: soft }),
        ]
      : []),
  ];
  return {
    version: 1,
    page: { background: "#ffffff", marginTop: 44, marginBottom: 40 },
    elements,
  };
}

export const DESIGN_STARTERS = [
  { key: "blank", name: "Blank", description: "Just the line items and totals.", build: blank },
  { key: "clean", name: "Clean", description: "Logo, hairline rule and plain type.", build: clean },
  { key: "bold", name: "Bold", description: "Pink and royal-blue bars with a logo tile.", build: bold },
] as const;

export type DesignStarterKey = (typeof DESIGN_STARTERS)[number]["key"];

/** A starting design for this kind of document. The three kinds differ only in wording. */
export function starterDesign(key: string | null | undefined, kind: DocumentKind): TemplateDesign {
  const starter = DESIGN_STARTERS.find((candidate) => candidate.key === key) ?? DESIGN_STARTERS[0];
  return starter.build(kind);
}
