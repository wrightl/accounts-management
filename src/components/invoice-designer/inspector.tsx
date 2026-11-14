"use client";

import { useId, useRef, useState, type Dispatch, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Copy,
  Trash2,
} from "lucide-react";
import {
  FIELD_GROUPS,
  designFields,
  fieldGroupLabel,
  fieldToken,
} from "@/lib/pdf/designer/fields";
import { useDesignKind } from "@/components/invoice-designer/kind-context";
import { DESIGNER_ICON_LABELS, DESIGNER_ICON_NAMES } from "@/lib/pdf/designer/icons";
import {
  DESIGN_FONTS,
  DESIGN_FONT_LABELS,
  LINE_ITEM_COLUMNS,
  type DesignElement,
  type DesignFont,
  type IconElement,
  type ImageElement,
  type LineItemColumnKey,
  type LineItemsElement,
  type ShapeElement,
  type TemplateDesign,
  type TextElement,
  type TotalsElement,
} from "@/lib/pdf/designer/schema";
import { cn } from "@/lib/utils";
import type { DesignerAsset } from "@/components/invoice-designer/panels";
import {
  ELEMENT_TYPE_LABELS,
  designColours,
  type DesignerAction,
} from "@/components/invoice-designer/state";

const input =
  "w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm focus:border-navy focus:outline-none focus:ring-2 focus:ring-accent/50";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border py-4 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-muted">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

/** Number box that applies on blur or Enter, so half-typed values aren't clamped mid-way. */
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  const shown = String(Math.round(value * 100) / 100);
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft);
    setDraft(null);
    if (draft.trim() === "" || !Number.isFinite(parsed)) return;
    const next = Math.min(Math.max(parsed, min), max);
    if (next !== value) onChange(next);
  };

  return (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          type="number"
          inputMode="decimal"
          className={input}
          value={draft ?? shown}
          min={min}
          max={max}
          step={step}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commit();
              event.currentTarget.blur();
            }
          }}
        />
      )}
    </Field>
  );
}

function ColourField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-8 w-10 shrink-0 cursor-pointer rounded border border-border bg-surface p-0.5"
          />
          <HexInput value={value} onChange={onChange} label={`${label} as a hex code`} />
        </div>
      )}
    </Field>
  );
}

function HexInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      aria-label={label}
      className={cn(input, "font-mono")}
      value={draft ?? value}
      spellCheck={false}
      onChange={(event) => {
        const next = event.target.value.trim();
        setDraft(next);
        const hex = next.startsWith("#") ? next : `#${next}`;
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) onChange(hex.toLowerCase());
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

/** A colour that can be switched off (no fill, no border). */
function OptionalColourField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string | null;
  /** Colour to start from when switched on. */
  fallback: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value !== null}
          onChange={(event) => onChange(event.target.checked ? fallback : null)}
        />
        {label}
      </label>
      {value !== null ? (
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="color"
            aria-label={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-8 w-10 shrink-0 cursor-pointer rounded border border-border bg-surface p-0.5"
          />
          <HexInput value={value} onChange={onChange} label={`${label} as a hex code`} />
        </div>
      ) : null}
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function FontField({ value, onChange }: { value: DesignFont; onChange: (font: DesignFont) => void }) {
  return (
    <Field label="Font">
      {(id) => (
        <select
          id={id}
          className={input}
          value={value}
          onChange={(event) => onChange(event.target.value as DesignFont)}
        >
          {DESIGN_FONTS.map((font) => (
            <option key={font} value={font}>
              {DESIGN_FONT_LABELS[font]}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

const pair = "grid grid-cols-2 gap-2";

function TextControls({
  element,
  set,
}: {
  element: TextElement;
  set: (patch: Partial<TextElement>) => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const kind = useDesignKind();

  const insertField = (token: string) => {
    const node = textarea.current;
    const at = node ? node.selectionStart : element.content.length;
    const end = node ? node.selectionEnd : element.content.length;
    set({ content: element.content.slice(0, at) + fieldToken(token) + element.content.slice(end) });
  };

  return (
    <>
      <Section title="Text">
        <Field label="Content">
          {(id) => (
            <textarea
              id={id}
              ref={textarea}
              data-designer-content
              className={cn(input, "min-h-[96px] resize-y font-mono text-xs")}
              value={element.content}
              onChange={(event) => set({ content: event.target.value })}
            />
          )}
        </Field>
        <Field label="Insert a detail">
          {(id) => (
            <select
              id={id}
              className={input}
              value=""
              onChange={(event) => {
                if (event.target.value) insertField(event.target.value);
              }}
            >
              <option value="">Choose a detail…</option>
              {FIELD_GROUPS.map((group) => (
                <optgroup key={group} label={fieldGroupLabel(group, kind)}>
                  {designFields(kind)
                    .filter((field) => field.group === group)
                    .map((field) => (
                      <option key={field.token} value={field.token}>
                        {field.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          )}
        </Field>
        <p className="text-xs text-muted">
          Details in double curly brackets are filled in from each document. A line is left out
          when the document has nothing for it.
        </p>
      </Section>
      <Section title="Type">
        <FontField value={element.fontFamily} onChange={(fontFamily) => set({ fontFamily })} />
        <div className={pair}>
          <NumberField
            label="Size"
            value={element.fontSize}
            min={5}
            max={96}
            step={0.5}
            onChange={(fontSize) => set({ fontSize })}
          />
          <Field label="Align">
            {(id) => (
              <select
                id={id}
                className={input}
                value={element.align}
                onChange={(event) => set({ align: event.target.value as TextElement["align"] })}
              >
                <option value="left">Left</option>
                <option value="center">Centre</option>
                <option value="right">Right</option>
              </select>
            )}
          </Field>
          <NumberField
            label="Line height"
            value={element.lineHeight}
            min={0.8}
            max={3}
            step={0.05}
            onChange={(lineHeight) => set({ lineHeight })}
          />
          <NumberField
            label="Letter spacing"
            value={element.letterSpacing}
            min={-2}
            max={10}
            step={0.1}
            onChange={(letterSpacing) => set({ letterSpacing })}
          />
        </div>
        <Check label="Bold" checked={element.bold} onChange={(bold) => set({ bold })} />
        <Check label="Capitals" checked={element.uppercase} onChange={(uppercase) => set({ uppercase })} />
        <ColourField label="Colour" value={element.colour} onChange={(colour) => set({ colour })} />
      </Section>
      <Section title="Background">
        <OptionalColourField
          label="Fill behind the text"
          value={element.fill}
          fallback="#e5e7eb"
          onChange={(fill) => set({ fill })}
        />
        <NumberField
          label="Space around the text"
          value={element.padding}
          min={0}
          max={40}
          onChange={(padding) => set({ padding })}
        />
      </Section>
    </>
  );
}

function ImageControls({
  element,
  set,
  assets,
}: {
  element: ImageElement;
  set: (patch: Partial<ImageElement>) => void;
  assets: DesignerAsset[];
}) {
  const value = element.source.kind === "logo" ? "logo" : element.source.assetId;
  return (
    <Section title="Picture">
      <Field label="Shows">
        {(id) => (
          <select
            id={id}
            className={input}
            value={value}
            onChange={(event) =>
              set({
                source:
                  event.target.value === "logo"
                    ? { kind: "logo" }
                    : { kind: "asset", assetId: event.target.value },
              })
            }
          >
            <option value="logo">Your logo</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.filename}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Fit">
        {(id) => (
          <select
            id={id}
            className={input}
            value={element.fit}
            onChange={(event) => set({ fit: event.target.value as ImageElement["fit"] })}
          >
            <option value="contain">Show the whole picture</option>
            <option value="cover">Fill the box, cropping the edges</option>
          </select>
        )}
      </Field>
      {element.source.kind === "logo" ? (
        <p className="text-xs text-muted">
          Uses the logo from Business settings, so it changes when you replace your logo.
        </p>
      ) : null}
    </Section>
  );
}

function IconControls({
  element,
  set,
}: {
  element: IconElement;
  set: (patch: Partial<IconElement>) => void;
}) {
  return (
    <Section title="Icon">
      <Field label="Icon">
        {(id) => (
          <select
            id={id}
            className={input}
            value={element.name}
            onChange={(event) => set({ name: event.target.value as IconElement["name"] })}
          >
            {DESIGNER_ICON_NAMES.map((name) => (
              <option key={name} value={name}>
                {DESIGNER_ICON_LABELS[name]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <ColourField label="Colour" value={element.colour} onChange={(colour) => set({ colour })} />
    </Section>
  );
}

function ShapeControls({
  element,
  set,
}: {
  element: ShapeElement;
  set: (patch: Partial<ShapeElement>) => void;
}) {
  return (
    <Section title="Shape">
      <Field label="Shape">
        {(id) => (
          <select
            id={id}
            className={input}
            value={element.shape}
            onChange={(event) => set({ shape: event.target.value as ShapeElement["shape"] })}
          >
            <option value="rect">Box</option>
            <option value="ellipse">Circle</option>
          </select>
        )}
      </Field>
      <OptionalColourField
        label="Fill"
        value={element.fill}
        fallback="#e5e7eb"
        onChange={(fill) => set({ fill })}
      />
      <OptionalColourField
        label="Border"
        value={element.stroke}
        fallback="#111827"
        onChange={(stroke) => set({ stroke })}
      />
      <div className={pair}>
        {element.stroke ? (
          <NumberField
            label="Border width"
            value={element.strokeWidth}
            min={0}
            max={20}
            step={0.5}
            onChange={(strokeWidth) => set({ strokeWidth })}
          />
        ) : null}
        {element.shape === "rect" ? (
          <NumberField
            label="Rounded corners"
            value={element.radius}
            min={0}
            max={200}
            onChange={(radius) => set({ radius })}
          />
        ) : null}
      </div>
    </Section>
  );
}

const COLUMN_LABELS: Record<LineItemColumnKey, string> = {
  description: "Description",
  quantity: "Quantity",
  unitPrice: "Unit price",
  discount: "Discount",
  amount: "Amount",
};

const COLUMN_DEFAULTS: Record<LineItemColumnKey, { label: string; width: number }> = {
  description: { label: "Description", width: 50 },
  quantity: { label: "Qty", width: 10 },
  unitPrice: { label: "Unit", width: 20 },
  discount: { label: "Discount", width: 12 },
  amount: { label: "Amount", width: 20 },
};

function TableControls({
  element,
  set,
}: {
  element: LineItemsElement;
  set: (patch: Partial<LineItemsElement>) => void;
}) {
  const toggle = (key: LineItemColumnKey, on: boolean) => {
    if (!on) {
      set({ columns: element.columns.filter((column) => column.key !== key) });
      return;
    }
    // Keep the usual left-to-right order whatever order columns are switched on in.
    const next = [...element.columns, { key, ...COLUMN_DEFAULTS[key] }].sort(
      (a, b) => LINE_ITEM_COLUMNS.indexOf(a.key) - LINE_ITEM_COLUMNS.indexOf(b.key),
    );
    set({ columns: next });
  };
  const change = (key: LineItemColumnKey, patch: { label?: string; width?: number }) =>
    set({
      columns: element.columns.map((column) =>
        column.key === key ? { ...column, ...patch } : column,
      ),
    });

  return (
    <>
      <Section title="Columns">
        {LINE_ITEM_COLUMNS.map((key) => {
          const column = element.columns.find((candidate) => candidate.key === key);
          return (
            <div key={key}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(column)}
                  // A table needs at least one column.
                  disabled={Boolean(column) && element.columns.length === 1}
                  onChange={(event) => toggle(key, event.target.checked)}
                />
                {COLUMN_LABELS[key]}
              </label>
              {column ? (
                <div className="mt-1.5 grid grid-cols-[1fr_4.5rem] gap-2">
                  <input
                    aria-label={`${COLUMN_LABELS[key]} heading`}
                    className={input}
                    value={column.label}
                    maxLength={40}
                    onChange={(event) => change(key, { label: event.target.value })}
                  />
                  <NumberFieldBare
                    label={`${COLUMN_LABELS[key]} width`}
                    value={column.width}
                    min={1}
                    max={100}
                    onChange={(width) => change(key, { width })}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
        <p className="text-xs text-muted">
          Widths are shares of the table. The discount column only appears on documents with a
          discounted line.
        </p>
      </Section>
      <Section title="Type">
        <FontField value={element.fontFamily} onChange={(fontFamily) => set({ fontFamily })} />
        <div className={pair}>
          <NumberField
            label="Size"
            value={element.fontSize}
            min={5}
            max={24}
            step={0.5}
            onChange={(fontSize) => set({ fontSize })}
          />
          <NumberField
            label="Cell spacing"
            value={element.cellPadding}
            min={2}
            max={20}
            onChange={(cellPadding) => set({ cellPadding })}
          />
        </div>
      </Section>
      <Section title="Heading row">
        <OptionalColourField
          label="Fill"
          value={element.headerFill}
          fallback="#111827"
          onChange={(headerFill) => set({ headerFill })}
        />
        <ColourField
          label="Text colour"
          value={element.headerColour}
          onChange={(headerColour) => set({ headerColour })}
        />
        <Check
          label="Bold"
          checked={element.headerBold}
          onChange={(headerBold) => set({ headerBold })}
        />
      </Section>
      <Section title="Rows">
        <ColourField
          label="Text colour"
          value={element.rowColour}
          onChange={(rowColour) => set({ rowColour })}
        />
        <OptionalColourField
          label="Shade alternate rows"
          value={element.stripeFill}
          fallback="#f3f4f6"
          onChange={(stripeFill) => set({ stripeFill })}
        />
        <OptionalColourField
          label="Lines between rows"
          value={element.ruleColour}
          fallback="#e5e7eb"
          onChange={(ruleColour) => set({ ruleColour })}
        />
      </Section>
    </>
  );
}

/** NumberField without its own visible label, for use inside a labelled row. */
function NumberFieldBare(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft);
    setDraft(null);
    if (draft.trim() === "" || !Number.isFinite(parsed)) return;
    props.onChange(Math.min(Math.max(parsed, props.min), props.max));
  };
  return (
    <input
      type="number"
      aria-label={props.label}
      className={input}
      value={draft ?? String(props.value)}
      min={props.min}
      max={props.max}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}

function TotalsControls({
  element,
  set,
}: {
  element: TotalsElement;
  set: (patch: Partial<TotalsElement>) => void;
}) {
  return (
    <>
      <Section title="Totals">
        <FontField value={element.fontFamily} onChange={(fontFamily) => set({ fontFamily })} />
        <div className={pair}>
          <NumberField
            label="Size"
            value={element.fontSize}
            min={5}
            max={24}
            step={0.5}
            onChange={(fontSize) => set({ fontSize })}
          />
          <NumberField
            label="Row spacing"
            value={element.rowPadding}
            min={1}
            max={20}
            onChange={(rowPadding) => set({ rowPadding })}
          />
        </div>
        <ColourField label="Text colour" value={element.colour} onChange={(colour) => set({ colour })} />
      </Section>
      <Section title="Total due row">
        <OptionalColourField
          label="Fill"
          value={element.totalFill}
          fallback="#111827"
          onChange={(totalFill) => set({ totalFill })}
        />
        <ColourField
          label="Text colour"
          value={element.totalColour}
          onChange={(totalColour) => set({ totalColour })}
        />
        <Check
          label="Bold"
          checked={element.totalBold}
          onChange={(totalBold) => set({ totalBold })}
        />
      </Section>
    </>
  );
}

function PageControls({
  design,
  dispatch,
}: {
  design: TemplateDesign;
  dispatch: Dispatch<DesignerAction>;
}) {
  const colours = designColours(design);
  return (
    <>
      <Section title="Page">
        <ColourField
          label="Background"
          value={design.page.background}
          onChange={(background) => dispatch({ type: "page", change: { background } })}
        />
        <div className={pair}>
          <NumberField
            label="Top margin"
            value={design.page.marginTop}
            min={0}
            max={300}
            onChange={(marginTop) => dispatch({ type: "page", change: { marginTop } })}
          />
          <NumberField
            label="Bottom margin"
            value={design.page.marginBottom}
            min={0}
            max={300}
            onChange={(marginBottom) => dispatch({ type: "page", change: { marginBottom } })}
          />
        </div>
        <p className="text-xs text-muted">
          Margins are the space kept clear when a long document runs onto another page.
        </p>
      </Section>
      <Section title="Colour scheme">
        <p className="text-xs text-muted">
          Every colour in this design. Change one to change it everywhere it is used.
        </p>
        <ul className="grid grid-cols-2 gap-2">
          {colours.map((colour) => (
            <li key={colour} className="flex items-center gap-2">
              <input
                type="color"
                aria-label={`Replace ${colour} everywhere`}
                value={colour}
                onChange={(event) =>
                  dispatch({ type: "recolour", from: colour, to: event.target.value })
                }
                className="h-8 w-10 shrink-0 cursor-pointer rounded border border-border bg-surface p-0.5"
              />
              <span className="font-mono text-xs text-muted">{colour}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

/** Right panel: settings for the selected element, or for the page when nothing is selected. */
export function Inspector({
  design,
  selected,
  dispatch,
  assets,
}: {
  design: TemplateDesign;
  selected: string[];
  dispatch: Dispatch<DesignerAction>;
  assets: DesignerAsset[];
}) {
  const elements = design.elements.filter((element) => selected.includes(element.id));

  if (elements.length === 0) return <PageControls design={design} dispatch={dispatch} />;

  if (elements.length > 1) {
    return (
      <Section title={`${elements.length} items selected`}>
        <p className="text-sm text-muted">Drag to move them together, or use the arrow keys.</p>
        <div className="flex flex-wrap gap-2">
          <ToolButton label="Duplicate" onClick={() => dispatch({ type: "duplicate", ids: selected })}>
            <Copy className="h-4 w-4" aria-hidden />
          </ToolButton>
          <ToolButton label="Delete" onClick={() => dispatch({ type: "remove", ids: selected })}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </ToolButton>
        </div>
      </Section>
    );
  }

  const [element] = elements;
  const set = <T extends DesignElement>(patch: Partial<T>) =>
    dispatch({
      type: "patch",
      ids: [element.id],
      change: (current) => ({ ...current, ...patch }) as DesignElement,
    });
  const isTable = element.type === "lineItems";
  const fixedHeight = isTable || element.type === "totals";

  return (
    <div>
      <Section title={ELEMENT_TYPE_LABELS[element.type]}>
        <div className={pair}>
          <NumberField label="Left" value={element.x} min={-595} max={595} onChange={(x) => set({ x })} />
          <NumberField label="Top" value={element.y} min={-842} max={842} onChange={(y) => set({ y })} />
          <NumberField label="Width" value={element.w} min={1} max={1190} onChange={(w) => set({ w })} />
          {fixedHeight ? null : (
            <NumberField label="Height" value={element.h} min={1} max={1684} onChange={(h) => set({ h })} />
          )}
        </div>
        {isTable ? (
          <p className="text-xs text-muted">
            The table grows with the lines on the document. Anything placed below the blue dashed line moves
            down with it.
          </p>
        ) : (
          <Check
            label="Show on every page"
            checked={element.repeat}
            onChange={(repeat) => set({ repeat })}
          />
        )}
        <div className="flex flex-wrap gap-1.5">
          <ToolButton
            label="Bring to front"
            onClick={() => dispatch({ type: "reorder", id: element.id, to: "front" })}
          >
            <ArrowUpToLine className="h-4 w-4" aria-hidden />
          </ToolButton>
          <ToolButton
            label="Bring forward"
            onClick={() => dispatch({ type: "reorder", id: element.id, to: "forward" })}
          >
            <ChevronUp className="h-4 w-4" aria-hidden />
          </ToolButton>
          <ToolButton
            label="Send backward"
            onClick={() => dispatch({ type: "reorder", id: element.id, to: "backward" })}
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
          </ToolButton>
          <ToolButton
            label="Send to back"
            onClick={() => dispatch({ type: "reorder", id: element.id, to: "back" })}
          >
            <ArrowDownToLine className="h-4 w-4" aria-hidden />
          </ToolButton>
          {isTable || element.type === "totals" ? null : (
            <ToolButton
              label="Duplicate"
              onClick={() => dispatch({ type: "duplicate", ids: [element.id] })}
            >
              <Copy className="h-4 w-4" aria-hidden />
            </ToolButton>
          )}
          {isTable ? null : (
            <ToolButton
              label="Delete"
              onClick={() => dispatch({ type: "remove", ids: [element.id] })}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </ToolButton>
          )}
        </div>
      </Section>

      {element.type === "text" ? <TextControls element={element} set={set} /> : null}
      {element.type === "image" ? (
        <ImageControls element={element} set={set} assets={assets} />
      ) : null}
      {element.type === "icon" ? <IconControls element={element} set={set} /> : null}
      {element.type === "shape" ? <ShapeControls element={element} set={set} /> : null}
      {element.type === "lineItems" ? <TableControls element={element} set={set} /> : null}
      {element.type === "totals" ? <TotalsControls element={element} set={set} /> : null}
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded-lg border border-border bg-surface p-1.5 text-foreground hover:bg-wash"
    >
      {children}
    </button>
  );
}
