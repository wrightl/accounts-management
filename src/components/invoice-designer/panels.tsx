"use client";

import { useRef, useState, useTransition, type Dispatch, type DragEvent, type ReactNode } from "react";
import {
  Circle,
  Image as ImageIcon,
  Minus,
  Sigma,
  Square,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import { deleteTemplateImage, uploadTemplateImage } from "@/actions/document-templates";
import { LOGO_ACCEPT } from "@/lib/company-logo-file";
import {
  DOCUMENT_FIELD_GROUP_LABELS,
  FIELD_GROUPS,
  contentParts,
  designFields,
  fieldGroupLabel,
} from "@/lib/pdf/designer/fields";
import type { DocumentKind } from "@/lib/pdf/templates/registry";
import { useDesignKind } from "@/components/invoice-designer/kind-context";
import {
  DESIGNER_ICON_LABELS,
  DESIGNER_ICON_NAMES,
} from "@/lib/pdf/designer/icons";
import type { DesignElement, TemplateDesign } from "@/lib/pdf/designer/schema";
import { cn } from "@/lib/utils";
import { PALETTE_DRAG_TYPE } from "@/components/invoice-designer/canvas";
import { DesignIcon } from "@/components/invoice-designer/element-view";
import {
  ELEMENT_TYPE_LABELS,
  createElement,
  type DesignerAction,
  type NewElementSpec,
} from "@/components/invoice-designer/state";

export interface DesignerAsset {
  id: string;
  filename: string;
}

/** Something that can be dragged onto the page, or clicked to add it near the top. */
function PaletteItem({
  spec,
  onAdd,
  className,
  title,
  children,
}: {
  spec: NewElementSpec;
  onAdd: (spec: NewElementSpec) => void;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const onDragStart = (event: DragEvent) => {
    event.dataTransfer.setData(PALETTE_DRAG_TYPE, JSON.stringify(spec));
    event.dataTransfer.effectAllowed = "copy";
  };
  return (
    <button
      type="button"
      draggable
      title={title}
      onDragStart={onDragStart}
      onClick={() => onAdd(spec)}
      className={cn(
        "flex cursor-grab items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-left text-sm transition-colors hover:border-navy/50 hover:bg-wash active:cursor-grabbing",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 mt-5 text-xs font-medium uppercase tracking-wider text-muted">
      {children}
    </h3>
  );
}

/** Left panel: the invoice details, text, pictures, icons and shapes that can go on the page. */
export function Palette({
  design,
  dispatch,
  assets,
  onAssetsChange,
}: {
  design: TemplateDesign;
  dispatch: Dispatch<DesignerAction>;
  assets: DesignerAsset[];
  onAssetsChange: (assets: DesignerAsset[]) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const kind = useDesignKind();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hasTotals = design.elements.some((element) => element.type === "totals");

  // Clicking (rather than dragging) puts the element near the top left, stepped
  // so several clicks don't stack exactly.
  const add = (spec: NewElementSpec) => {
    const offset = (design.elements.length % 8) * 14;
    dispatch({ type: "add", element: createElement(spec, 48 + offset, 48 + offset) });
  };

  const upload = (file: File) => {
    setError(null);
    const formData = new FormData();
    formData.set("image", file);
    startTransition(async () => {
      const result = await uploadTemplateImage(formData);
      if (!result.ok || !result.id) {
        setError(result.ok ? "The upload failed. Try again." : result.error);
        return;
      }
      onAssetsChange([...assets, { id: result.id, filename: file.name }]);
      add({ kind: "image", assetId: result.id });
    });
  };

  const removeAsset = (asset: DesignerAsset) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteTemplateImage(asset.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onAssetsChange(assets.filter((candidate) => candidate.id !== asset.id));
    });
  };

  return (
    <div>
      <p className="mb-4 text-xs text-muted">
        Drag onto the page, or click to add. {DOCUMENT_FIELD_GROUP_LABELS[kind]} details are filled
        in from each {DOCUMENT_FIELD_GROUP_LABELS[kind].toLowerCase()}.
      </p>

      {FIELD_GROUPS.map((group) => (
        <div key={group}>
          <Heading>{fieldGroupLabel(group, kind)}</Heading>
          <div className="flex flex-wrap gap-1.5">
            {designFields(kind).filter((field) => field.group === group).map((field) => (
              <PaletteItem
                key={field.token}
                spec={{ kind: "field", token: field.token }}
                onAdd={add}
                className="border-blue-200 bg-blue-50 text-blue-950 hover:bg-blue-100"
              >
                {field.label}
              </PaletteItem>
            ))}
          </div>
        </div>
      ))}

      <Heading>Text and shapes</Heading>
      <div className="grid grid-cols-2 gap-1.5">
        <PaletteItem spec={{ kind: "text" }} onAdd={add}>
          <Type className="h-4 w-4" aria-hidden /> Text
        </PaletteItem>
        <PaletteItem spec={{ kind: "shape", shape: "rect" }} onAdd={add}>
          <Square className="h-4 w-4" aria-hidden /> Box
        </PaletteItem>
        <PaletteItem spec={{ kind: "shape", shape: "ellipse" }} onAdd={add}>
          <Circle className="h-4 w-4" aria-hidden /> Circle
        </PaletteItem>
        <PaletteItem spec={{ kind: "shape", shape: "line" }} onAdd={add}>
          <Minus className="h-4 w-4" aria-hidden /> Line
        </PaletteItem>
        {hasTotals ? null : (
          <PaletteItem spec={{ kind: "totals" }} onAdd={add}>
            <Sigma className="h-4 w-4" aria-hidden /> Totals
          </PaletteItem>
        )}
      </div>

      <Heading>Pictures</Heading>
      <div className="grid grid-cols-2 gap-1.5">
        <PaletteItem spec={{ kind: "image" }} onAdd={add}>
          <ImageIcon className="h-4 w-4" aria-hidden /> Your logo
        </PaletteItem>
        <button
          type="button"
          disabled={pending}
          onClick={() => fileInput.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-left text-sm hover:bg-wash disabled:opacity-50"
        >
          <Upload className="h-4 w-4" aria-hidden /> {pending ? "Working…" : "Upload"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={LOGO_ACCEPT}
          className="sr-only"
          aria-label="Upload a picture"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) upload(file);
          }}
        />
      </div>
      {assets.length > 0 ? (
        <ul className="mt-2 grid grid-cols-3 gap-1.5">
          {assets.map((asset) => (
            <li key={asset.id} className="group relative">
              <PaletteItem
                spec={{ kind: "image", assetId: asset.id }}
                onAdd={add}
                title={asset.filename}
                className="aspect-square w-full justify-center p-1"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/document-templates/assets/${asset.id}`}
                  alt={asset.filename}
                  draggable={false}
                  className="max-h-full max-w-full object-contain"
                />
              </PaletteItem>
              <button
                type="button"
                disabled={pending}
                onClick={() => removeAsset(asset)}
                aria-label={`Remove ${asset.filename}`}
                className="absolute right-0.5 top-0.5 rounded bg-surface/90 p-0.5 text-muted opacity-0 hover:text-red-700 focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      <Heading>Icons</Heading>
      <div className="grid grid-cols-6 gap-1">
        {DESIGNER_ICON_NAMES.map((name) => (
          <PaletteItem
            key={name}
            spec={{ kind: "icon", name }}
            onAdd={add}
            title={DESIGNER_ICON_LABELS[name]}
            className="aspect-square justify-center p-1.5"
          >
            <DesignIcon name={name} colour="currentColor" size={16} />
            <span className="sr-only">{DESIGNER_ICON_LABELS[name]}</span>
          </PaletteItem>
        ))}
      </div>
    </div>
  );
}

function layerLabel(element: DesignElement, kind: DocumentKind): string {
  switch (element.type) {
    case "text": {
      const summary = contentParts(element.content, kind)
        .map((part) => (part.kind === "text" ? part.text : part.field.label))
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      return summary ? summary.slice(0, 40) : "Text";
    }
    case "image":
      return element.source.kind === "logo" ? "Your logo" : "Picture";
    case "icon":
      return `Icon: ${DESIGNER_ICON_LABELS[element.name]}`;
    case "shape":
      return element.h <= 3 || element.w <= 3 ? "Line" : element.shape === "ellipse" ? "Circle" : "Box";
    default:
      return ELEMENT_TYPE_LABELS[element.type];
  }
}

/** Everything on the page, front first, for selecting things that are hard to click. */
export function Layers({
  design,
  selected,
  dispatch,
}: {
  design: TemplateDesign;
  selected: string[];
  dispatch: Dispatch<DesignerAction>;
}) {
  const kind = useDesignKind();
  return (
    <ul className="space-y-0.5">
      {[...design.elements].reverse().map((element) => (
        <li key={element.id}>
          <button
            type="button"
            aria-pressed={selected.includes(element.id)}
            onClick={(event) =>
              dispatch({
                type: "select",
                ids: event.shiftKey
                  ? selected.includes(element.id)
                    ? selected.filter((id) => id !== element.id)
                    : [...selected, element.id]
                  : [element.id],
              })
            }
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-wash",
              selected.includes(element.id) && "bg-wash font-medium",
            )}
          >
            <span className="min-w-0 truncate">{layerLabel(element, kind)}</span>
            <span className="shrink-0 text-xs text-muted">
              {element.repeat ? "Every page" : ELEMENT_TYPE_LABELS[element.type]}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
