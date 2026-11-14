"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { designTotalsRows, lineItemCell, visibleColumns } from "@/lib/pdf/designer/content";
import { contentParts, fillContent, type DesignData } from "@/lib/pdf/designer/fields";
import { DESIGNER_ICONS } from "@/lib/pdf/designer/icons";
import {
  BLOCK_LINE_HEIGHT,
  type DesignElement,
  type DesignFont,
  type LineItemsElement,
  type TextElement,
  type TotalsElement,
} from "@/lib/pdf/designer/schema";
import { FONT_STACKS, boldWeight } from "@/components/invoice-designer/state";

function fontStyle(font: DesignFont, bold: boolean): CSSProperties {
  return { fontFamily: FONT_STACKS[font], fontWeight: bold ? boldWeight(font) : 400 };
}

/** Lucide outline drawn as SVG; the PDF draws the same shapes. */
export function DesignIcon({
  name,
  colour,
  size,
}: {
  name: keyof typeof DESIGNER_ICONS;
  colour: string;
  size?: number | string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size ?? "100%"}
      height={size ?? "100%"}
      fill="none"
      stroke={colour}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {DESIGNER_ICONS[name].map(([tag, attrs], i) => {
        const Tag = tag as "path";
        return <Tag key={i} {...(attrs as Record<string, string>)} />;
      })}
    </svg>
  );
}

function TextView({
  element,
  data,
  preview,
}: {
  element: TextElement;
  data: DesignData;
  preview: boolean;
}) {
  const style: CSSProperties = {
    ...fontStyle(element.fontFamily, element.bold),
    fontSize: element.fontSize,
    color: element.colour,
    textAlign: element.align,
    lineHeight: element.lineHeight,
    letterSpacing: element.letterSpacing,
    textTransform: element.uppercase ? "uppercase" : undefined,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
  };
  return (
    <div
      style={{
        padding: element.padding,
        boxSizing: "border-box",
        ...(element.fill ? { backgroundColor: element.fill, minHeight: element.h } : {}),
      }}
    >
      <div style={style}>
        {preview
          ? fillContent(element.content, data)
          : // While designing, fields show sample values, tinted so they read as placeholders.
            contentParts(element.content, data.kind).map((part, i) =>
              part.kind === "text" ? (
                part.text
              ) : (
                <span
                  key={i}
                  title={part.field.label}
                  style={{
                    backgroundColor: "rgba(59, 130, 246, 0.16)",
                    boxShadow: "0 0 0 1px rgba(59, 130, 246, 0.35)",
                    borderRadius: 2,
                  }}
                >
                  {part.field.resolve(data) || `[${part.field.label}]`}
                </span>
              ),
            )}
      </div>
    </div>
  );
}

function LineItemsView({
  element,
  data,
  onMeasure,
}: {
  element: LineItemsElement;
  data: DesignData;
  onMeasure?: (height: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !onMeasure) return;
    // offsetHeight is in the page's own units, whatever the zoom.
    const measure = () => onMeasure(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [onMeasure]);

  const columns = visibleColumns(element, data.lines);
  const cell = (key: string, width: number): CSSProperties => ({
    flex: `${width} 1 0`,
    minWidth: 0,
    padding: `0 ${element.cellPadding}px`,
    textAlign: key === "description" ? "left" : "right",
    fontSize: element.fontSize,
    lineHeight: BLOCK_LINE_HEIGHT,
    overflowWrap: "break-word",
  });
  const rule: CSSProperties = element.ruleColour
    ? { borderBottom: `0.75px solid ${element.ruleColour}` }
    : {};

  return (
    <div ref={ref}>
      <div
        style={{
          display: "flex",
          padding: `${element.cellPadding}px 0`,
          ...(element.headerFill ? { backgroundColor: element.headerFill } : rule),
        }}
      >
        {columns.map((column) => (
          <div
            key={column.key}
            style={{
              ...cell(column.key, column.width),
              ...fontStyle(element.fontFamily, element.headerBold),
              color: element.headerColour,
            }}
          >
            {column.label}
          </div>
        ))}
      </div>
      {data.lines.map((line, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            padding: `${element.cellPadding}px 0`,
            ...rule,
            ...(element.stripeFill && i % 2 === 1 ? { backgroundColor: element.stripeFill } : {}),
          }}
        >
          {columns.map((column) => (
            <div
              key={column.key}
              style={{
                ...cell(column.key, column.width),
                ...fontStyle(element.fontFamily, false),
                color: element.rowColour,
              }}
            >
              {lineItemCell(line, column.key)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TotalsView({ element, data }: { element: TotalsElement; data: DesignData }) {
  return (
    <div>
      {designTotalsRows(data).map((row) => (
        <div
          key={row.label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: `${element.rowPadding}px ${element.rowPadding * 2}px`,
            fontSize: element.fontSize,
            lineHeight: BLOCK_LINE_HEIGHT,
            ...fontStyle(element.fontFamily, row.total && element.totalBold),
            color: row.total ? element.totalColour : element.colour,
            ...(row.total && element.totalFill ? { backgroundColor: element.totalFill } : {}),
          }}
        >
          <span>{row.label}</span>
          <span>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

/** One element drawn as HTML the way the PDF draws it. Sized by its parent frame. */
export function ElementView({
  element,
  data,
  preview,
  hasLogo,
  onMeasureTable,
}: {
  element: DesignElement;
  data: DesignData;
  /** Show the finished document: no placeholder tint, empty lines dropped. */
  preview: boolean;
  hasLogo: boolean;
  onMeasureTable?: (height: number) => void;
}) {
  switch (element.type) {
    case "text":
      return <TextView element={element} data={data} preview={preview} />;
    case "image": {
      const src =
        element.source.kind === "logo"
          ? hasLogo
            ? "/api/company/logo"
            : null
          : `/api/document-templates/assets/${element.source.assetId}`;
      if (!src) {
        return preview ? null : (
          <div
            style={{
              height: element.h,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px dashed #9ca3af",
              color: "#6b7280",
              fontSize: 9,
              textAlign: "center",
            }}
          >
            Your logo
          </div>
        );
      }
      return (
        // A plain <img>: the picture comes from an authorised route, not a static asset.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          style={{ width: "100%", height: element.h, objectFit: element.fit, display: "block" }}
        />
      );
    }
    case "icon":
      return (
        <div style={{ height: element.h }}>
          <DesignIcon name={element.name} colour={element.colour} />
        </div>
      );
    case "shape": {
      const border =
        element.stroke && element.strokeWidth > 0
          ? `${element.strokeWidth}px solid ${element.stroke}`
          : undefined;
      return (
        <div
          style={{
            height: element.h,
            boxSizing: "border-box",
            backgroundColor: element.fill ?? undefined,
            border,
            borderRadius: element.shape === "ellipse" ? "50%" : element.radius,
          }}
        />
      );
    }
    case "lineItems":
      return <LineItemsView element={element} data={data} onMeasure={onMeasureTable} />;
    case "totals":
      return <TotalsView element={element} data={data} />;
  }
}
