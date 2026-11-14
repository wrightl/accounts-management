import { z } from "zod";
import { DESIGNER_ICON_NAMES } from "@/lib/pdf/designer/icons";

/** A4 in PDF points; every position and size in a design uses this unit. */
export const PAGE_WIDTH = 595;
export const PAGE_HEIGHT = 842;

/** Line height of table and totals rows, the same in the editor and the PDF. */
export const BLOCK_LINE_HEIGHT = 1.3;

export const MAX_ELEMENTS = 150;
export const MAX_IMAGES = 20;

/**
 * Fonts a design can use. Outfit and Poppins are vendored and identical in
 * the editor and the PDF; the other three are the PDF's built-in faces, shown
 * in the editor with the nearest system font.
 */
export const DESIGN_FONTS = ["Outfit", "Poppins", "Helvetica", "Times-Roman", "Courier"] as const;
export type DesignFont = (typeof DESIGN_FONTS)[number];

export const DESIGN_FONT_LABELS: Record<DesignFont, string> = {
  Outfit: "Outfit",
  Poppins: "Poppins",
  Helvetica: "Helvetica",
  "Times-Roman": "Times",
  Courier: "Courier",
};

export const LINE_ITEM_COLUMNS = [
  "description",
  "quantity",
  "unitPrice",
  "discount",
  "amount",
] as const;
export type LineItemColumnKey = (typeof LINE_ITEM_COLUMNS)[number];

const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #1a2b3c");
const optionalColour = colour.nullable();
const font = z.enum(DESIGN_FONTS);

const box = {
  id: z.string().min(1).max(40),
  x: z.number().min(-PAGE_WIDTH).max(PAGE_WIDTH),
  y: z.number().min(-PAGE_HEIGHT).max(PAGE_HEIGHT),
  w: z.number().min(1).max(PAGE_WIDTH * 2),
  h: z.number().min(1).max(PAGE_HEIGHT * 2),
  /** Drawn on every page at the same place, such as a header or footer bar. */
  repeat: z.boolean(),
};

const textElement = z.object({
  ...box,
  type: z.literal("text"),
  /** Plain text; `{{invoice.number}}`-style tokens are filled from the invoice. */
  content: z.string().max(2000),
  fontFamily: font,
  fontSize: z.number().min(5).max(96),
  bold: z.boolean(),
  colour,
  align: z.enum(["left", "center", "right"]),
  lineHeight: z.number().min(0.8).max(3),
  letterSpacing: z.number().min(-2).max(10),
  uppercase: z.boolean(),
  /** Background behind the text, for labels and pills. */
  fill: optionalColour,
  padding: z.number().min(0).max(40),
});

const imageElement = z.object({
  ...box,
  type: z.literal("image"),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("logo") }),
    z.object({ kind: z.literal("asset"), assetId: z.uuid() }),
  ]),
  fit: z.enum(["contain", "cover"]),
});

const iconElement = z.object({
  ...box,
  type: z.literal("icon"),
  name: z.enum(DESIGNER_ICON_NAMES),
  colour,
});

const shapeElement = z.object({
  ...box,
  type: z.literal("shape"),
  shape: z.enum(["rect", "ellipse"]),
  fill: optionalColour,
  stroke: optionalColour,
  strokeWidth: z.number().min(0).max(20),
  radius: z.number().min(0).max(200),
});

const lineItemsElement = z.object({
  ...box,
  type: z.literal("lineItems"),
  columns: z
    .array(
      z.object({
        key: z.enum(LINE_ITEM_COLUMNS),
        label: z.string().max(40),
        /** Share of the table width; columns are scaled to fill it. */
        width: z.number().min(1).max(100),
      }),
    )
    .min(1)
    .max(LINE_ITEM_COLUMNS.length),
  fontFamily: font,
  fontSize: z.number().min(5).max(24),
  headerFill: optionalColour,
  headerColour: colour,
  headerBold: z.boolean(),
  rowColour: colour,
  stripeFill: optionalColour,
  ruleColour: optionalColour,
  cellPadding: z.number().min(2).max(20),
});

const totalsElement = z.object({
  ...box,
  type: z.literal("totals"),
  fontFamily: font,
  fontSize: z.number().min(5).max(24),
  colour,
  totalFill: optionalColour,
  totalColour: colour,
  totalBold: z.boolean(),
  rowPadding: z.number().min(1).max(20),
});

export const designElementSchema = z.discriminatedUnion("type", [
  textElement,
  imageElement,
  iconElement,
  shapeElement,
  lineItemsElement,
  totalsElement,
]);

export const templateDesignSchema = z
  .object({
    version: z.literal(1),
    page: z.object({
      background: colour,
      /** Space kept clear at the top and bottom of continuation pages. */
      marginTop: z.number().min(0).max(300),
      marginBottom: z.number().min(0).max(300),
    }),
    /** Back to front: later elements are drawn over earlier ones. */
    elements: z.array(designElementSchema).max(MAX_ELEMENTS),
  })
  .superRefine((design, ctx) => {
    const ids = new Set<string>();
    for (const element of design.elements) {
      if (ids.has(element.id)) {
        ctx.addIssue({ code: "custom", message: "Two elements share an id" });
        break;
      }
      ids.add(element.id);
    }

    const tables = design.elements.filter((element) => element.type === "lineItems");
    if (tables.length !== 1) {
      ctx.addIssue({ code: "custom", message: "A design needs exactly one line items table" });
    } else {
      const [table] = tables;
      if (table.repeat) {
        ctx.addIssue({ code: "custom", message: "The line items table can't repeat on every page" });
      }
      if (table.y < design.page.marginTop) {
        ctx.addIssue({
          code: "custom",
          message: "Move the line items table below the top margin",
        });
      }
      if (new Set(table.columns.map((column) => column.key)).size !== table.columns.length) {
        ctx.addIssue({ code: "custom", message: "A table column appears twice" });
      }
    }

    if (design.elements.filter((element) => element.type === "totals").length > 1) {
      ctx.addIssue({ code: "custom", message: "A design can have one totals block" });
    }
    if (design.elements.filter((element) => element.type === "image").length > MAX_IMAGES) {
      ctx.addIssue({ code: "custom", message: `A design can have up to ${MAX_IMAGES} images` });
    }
  });

export type TemplateDesign = z.infer<typeof templateDesignSchema>;
export type DesignElement = z.infer<typeof designElementSchema>;
export type DesignElementType = DesignElement["type"];
export type TextElement = z.infer<typeof textElement>;
export type ImageElement = z.infer<typeof imageElement>;
export type IconElement = z.infer<typeof iconElement>;
export type ShapeElement = z.infer<typeof shapeElement>;
export type LineItemsElement = z.infer<typeof lineItemsElement>;
export type TotalsElement = z.infer<typeof totalsElement>;

export type ParsedDesign =
  | { ok: true; design: TemplateDesign }
  | { ok: false; error: string };

export function parseTemplateDesign(raw: unknown): ParsedDesign {
  const parsed = templateDesignSchema.safeParse(raw);
  if (parsed.success) return { ok: true, design: parsed.data };
  return { ok: false, error: parsed.error.issues[0]?.message ?? "This design isn't valid" };
}

export const templateNameSchema = z
  .string()
  .trim()
  .min(1, "Give the template a name")
  .max(80, "Keep the name under 80 characters");

/** The table every design has. */
export function designTable(design: TemplateDesign): LineItemsElement {
  const table = design.elements.find((element) => element.type === "lineItems");
  if (!table) throw new Error("Design has no line items table");
  return table;
}

/**
 * Where an element is drawn. Repeating elements sit at a fixed place on every
 * page; elements starting below the table follow it down the page as lines
 * are added; everything else stays where it is on the first page.
 */
export function elementPlacement(
  element: DesignElement,
  table: LineItemsElement,
): "repeat" | "table" | "above" | "below" {
  if (element.id === table.id) return "table";
  if (element.repeat) return "repeat";
  return element.y >= table.y + table.h ? "below" : "above";
}
