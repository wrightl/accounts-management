import {
  PAGE_HEIGHT,
  PAGE_WIDTH,
  type DesignElement,
  type DesignElementType,
  type DesignFont,
  type TemplateDesign,
} from "@/lib/pdf/designer/schema";
import { fieldToken } from "@/lib/pdf/designer/fields";
import type { DesignerIconName } from "@/lib/pdf/designer/icons";

/** How far back Undo goes. */
const HISTORY_LIMIT = 100;

export interface DesignerState {
  name: string;
  design: TemplateDesign;
  selected: string[];
  past: TemplateDesign[];
  future: TemplateDesign[];
  /** Changed since the last save. */
  dirty: boolean;
}

export type DesignerAction =
  | { type: "select"; ids: string[] }
  | { type: "rename"; name: string }
  /** Change elements. `record: false` leaves Undo alone (mid-drag updates). */
  | { type: "patch"; ids: string[]; change: (element: DesignElement) => DesignElement; record?: boolean }
  /** After a drag: make the design as it was before the drag the Undo step. */
  | { type: "checkpoint"; before: TemplateDesign }
  | { type: "page"; change: Partial<TemplateDesign["page"]> }
  | { type: "recolour"; from: string; to: string }
  | { type: "add"; element: DesignElement }
  | { type: "remove"; ids: string[] }
  | { type: "duplicate"; ids: string[] }
  | { type: "reorder"; id: string; to: "front" | "back" | "forward" | "backward" }
  /** The table's height as drawn with the sample lines; not an edit the user made. */
  | { type: "measureTable"; height: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "saved" };

export function initialDesignerState(name: string, design: TemplateDesign): DesignerState {
  return { name, design, selected: [], past: [], future: [], dirty: false };
}

function record(state: DesignerState, design: TemplateDesign, selected = state.selected): DesignerState {
  return {
    ...state,
    design,
    selected,
    past: [...state.past, state.design].slice(-HISTORY_LIMIT),
    future: [],
    dirty: true,
  };
}

export function newElementId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** Keep the table clear of the top margin, where continuation pages start. */
function constrain(element: DesignElement, design: TemplateDesign): DesignElement {
  if (element.type !== "lineItems") return element;
  return { ...element, y: Math.max(element.y, design.page.marginTop), repeat: false };
}

const COLOUR_KEYS = [
  "colour",
  "fill",
  "stroke",
  "headerFill",
  "headerColour",
  "rowColour",
  "stripeFill",
  "ruleColour",
  "totalFill",
  "totalColour",
] as const;

/** Every colour a design uses, most used first, for changing the scheme in one go. */
export function designColours(design: TemplateDesign): string[] {
  const counts = new Map<string, number>();
  const add = (value: unknown) => {
    if (typeof value === "string") {
      const key = value.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  };
  add(design.page.background);
  for (const element of design.elements) {
    const values = element as unknown as Record<string, unknown>;
    for (const key of COLOUR_KEYS) add(values[key]);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([colour]) => colour);
}

function recolour(design: TemplateDesign, from: string, to: string): TemplateDesign {
  const swap = (value: unknown) =>
    typeof value === "string" && value.toLowerCase() === from.toLowerCase() ? to : value;
  return {
    ...design,
    page: { ...design.page, background: swap(design.page.background) as string },
    elements: design.elements.map((element) => {
      const next = { ...element } as unknown as Record<string, unknown>;
      for (const key of COLOUR_KEYS) {
        if (key in next) next[key] = swap(next[key]);
      }
      return next as unknown as DesignElement;
    }),
  };
}

export function designerReducer(state: DesignerState, action: DesignerAction): DesignerState {
  switch (action.type) {
    case "select":
      return { ...state, selected: action.ids };
    case "rename":
      return { ...state, name: action.name, dirty: true };
    case "patch": {
      const design: TemplateDesign = {
        ...state.design,
        elements: state.design.elements.map((element) =>
          action.ids.includes(element.id)
            ? constrain(action.change(element), state.design)
            : element,
        ),
      };
      return action.record === false
        ? { ...state, design, dirty: true }
        : record(state, design);
    }
    case "checkpoint":
      if (action.before === state.design) return state;
      return {
        ...state,
        past: [...state.past, action.before].slice(-HISTORY_LIMIT),
        future: [],
        dirty: true,
      };
    case "page": {
      const page = { ...state.design.page, ...action.change };
      const design = { ...state.design, page };
      return record(state, {
        ...design,
        elements: design.elements.map((element) => constrain(element, design)),
      });
    }
    case "recolour":
      return record(state, recolour(state.design, action.from, action.to));
    case "add":
      return record(
        state,
        { ...state.design, elements: [...state.design.elements, action.element] },
        [action.element.id],
      );
    case "remove": {
      // The table is part of every invoice and can't be removed.
      const ids = action.ids.filter(
        (id) => state.design.elements.find((element) => element.id === id)?.type !== "lineItems",
      );
      if (ids.length === 0) return state;
      return record(
        state,
        {
          ...state.design,
          elements: state.design.elements.filter((element) => !ids.includes(element.id)),
        },
        [],
      );
    }
    case "duplicate": {
      const copies = state.design.elements
        .filter(
          (element) =>
            action.ids.includes(element.id) &&
            element.type !== "lineItems" &&
            element.type !== "totals",
        )
        .map((element) => ({
          ...element,
          id: newElementId(),
          x: element.x + 12,
          y: element.y + 12,
        }));
      if (copies.length === 0) return state;
      return record(
        state,
        { ...state.design, elements: [...state.design.elements, ...copies] },
        copies.map((copy) => copy.id),
      );
    }
    case "reorder": {
      const elements = [...state.design.elements];
      const from = elements.findIndex((element) => element.id === action.id);
      if (from < 0) return state;
      const last = elements.length - 1;
      const to =
        action.to === "front"
          ? last
          : action.to === "back"
            ? 0
            : action.to === "forward"
              ? Math.min(from + 1, last)
              : Math.max(from - 1, 0);
      if (to === from) return state;
      const [moved] = elements.splice(from, 1);
      elements.splice(to, 0, moved);
      return record(state, { ...state.design, elements });
    }
    case "measureTable": {
      const table = state.design.elements.find((element) => element.type === "lineItems");
      if (!table || Math.abs(table.h - action.height) < 0.5) return state;
      return {
        ...state,
        design: {
          ...state.design,
          elements: state.design.elements.map((element) =>
            element.id === table.id ? { ...element, h: action.height } : element,
          ),
        },
      };
    }
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        design: previous,
        past: state.past.slice(0, -1),
        future: [state.design, ...state.future],
        selected: state.selected.filter((id) => previous.elements.some((e) => e.id === id)),
        dirty: true,
      };
    }
    case "redo": {
      const [next, ...future] = state.future;
      if (!next) return state;
      return {
        ...state,
        design: next,
        past: [...state.past, state.design],
        future,
        selected: state.selected.filter((id) => next.elements.some((e) => e.id === id)),
        dirty: true,
      };
    }
    case "saved":
      return { ...state, dirty: false };
  }
}

/** What the palette can add. */
export type NewElementSpec =
  | { kind: "text" }
  | { kind: "field"; token: string }
  | { kind: "image"; assetId?: string }
  | { kind: "icon"; name: DesignerIconName }
  | { kind: "shape"; shape: "rect" | "ellipse" | "line" }
  | { kind: "totals" };

const DEFAULT_FONT: DesignFont = "Outfit";

/** A new element with its top-left corner at (x, y), kept on the page. */
export function createElement(spec: NewElementSpec, x: number, y: number): DesignElement {
  const base = (w: number, h: number) => ({
    id: newElementId(),
    x: Math.round(Math.min(Math.max(x, 0), PAGE_WIDTH - w)),
    y: Math.round(Math.min(Math.max(y, 0), PAGE_HEIGHT - h)),
    w,
    h,
    repeat: false,
  });
  const text = (content: string, w: number, h: number): DesignElement => ({
    ...base(w, h),
    type: "text",
    content,
    fontFamily: DEFAULT_FONT,
    fontSize: 10,
    bold: false,
    colour: "#111827",
    align: "left",
    lineHeight: 1.4,
    letterSpacing: 0,
    uppercase: false,
    fill: null,
    padding: 0,
  });

  switch (spec.kind) {
    case "text":
      return text("Your text", 160, 16);
    case "field":
      return text(fieldToken(spec.token), 180, spec.token.endsWith("address") ? 56 : 16);
    case "image":
      return {
        ...base(80, 80),
        type: "image",
        source: spec.assetId ? { kind: "asset", assetId: spec.assetId } : { kind: "logo" },
        fit: "contain",
      };
    case "icon":
      return { ...base(18, 18), type: "icon", name: spec.name, colour: "#111827" };
    case "shape":
      return {
        ...(spec.shape === "line" ? base(200, 1) : base(120, spec.shape === "ellipse" ? 120 : 60)),
        type: "shape",
        shape: spec.shape === "ellipse" ? "ellipse" : "rect",
        fill: spec.shape === "line" ? "#111827" : "#e5e7eb",
        stroke: null,
        strokeWidth: 1,
        radius: 0,
      };
    case "totals":
      return {
        ...base(200, 80),
        type: "totals",
        fontFamily: DEFAULT_FONT,
        fontSize: 10,
        colour: "#4b5563",
        totalFill: null,
        totalColour: "#111827",
        totalBold: true,
        rowPadding: 5,
      };
  }
}

export const ELEMENT_TYPE_LABELS: Record<DesignElementType, string> = {
  text: "Text",
  image: "Picture",
  icon: "Icon",
  shape: "Shape",
  lineItems: "Line items",
  totals: "Totals",
};

/** CSS font stacks matching the PDF's fonts (see DESIGN_FONTS). */
export const FONT_STACKS: Record<DesignFont, string> = {
  Outfit: 'var(--font-outfit), "Outfit", sans-serif',
  Poppins: 'var(--font-design-poppins), "Poppins", sans-serif',
  Helvetica: "Helvetica, Arial, sans-serif",
  "Times-Roman": '"Times New Roman", Times, serif',
  Courier: '"Courier New", Courier, monospace',
};

/** The weight "bold" means for a font, as in the PDF (Outfit ships a semibold only). */
export function boldWeight(font: DesignFont): number {
  return font === "Outfit" ? 600 : 700;
}
