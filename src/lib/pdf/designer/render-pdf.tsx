import "server-only";
import React from "react";
import {
  Circle,
  Document,
  Ellipse,
  Image as PdfImage,
  Line,
  Page,
  Path,
  Polyline,
  Rect,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import { pdfFont } from "@/lib/pdf/fonts";
import { designTotalsRows, lineItemCell, visibleColumns } from "@/lib/pdf/designer/content";
import { fillContent, type DesignData } from "@/lib/pdf/designer/fields";
import { DESIGNER_ICONS, type IconShape } from "@/lib/pdf/designer/icons";
import {
  BLOCK_LINE_HEIGHT,
  PAGE_HEIGHT,
  designTable,
  elementPlacement,
  type DesignElement,
  type DesignFont,
  type LineItemColumnKey,
  type LineItemsElement,
  type TemplateDesign,
  type TotalsElement,
} from "@/lib/pdf/designer/schema";
import type { PdfLine } from "@/lib/pdf/templates/types";

/** Data URIs for a design's pictures: "logo" and each asset id. Missing ones are left out. */
export type DesignImages = Record<string, string | undefined>;

const BUILT_IN_BOLD: Record<Exclude<DesignFont, "Outfit" | "Poppins">, string> = {
  Helvetica: "Helvetica-Bold",
  "Times-Roman": "Times-Bold",
  Courier: "Courier-Bold",
};

function fontStyle(family: DesignFont, bold: boolean): Style {
  if (family === "Outfit" || family === "Poppins") {
    const registered = pdfFont(family);
    if (registered !== family) return { fontFamily: bold ? "Helvetica-Bold" : "Helvetica" };
    // Outfit ships regular and semibold only.
    return { fontFamily: family, fontWeight: bold ? (family === "Outfit" ? 600 : 700) : 400 };
  }
  return { fontFamily: bold ? BUILT_IN_BOLD[family] : family };
}

function IconShapeNode({ shape, colour }: { shape: IconShape; colour: string }) {
  const [tag, attrs] = shape;
  const stroke = {
    stroke: colour,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
  switch (tag) {
    case "path":
      return <Path d={attrs.d} {...stroke} />;
    case "rect":
      return (
        <Rect
          x={attrs.x}
          y={attrs.y}
          width={attrs.width}
          height={attrs.height}
          rx={attrs.rx}
          ry={attrs.ry ?? attrs.rx}
          {...stroke}
        />
      );
    case "circle":
      return <Circle cx={attrs.cx} cy={attrs.cy} r={attrs.r} {...stroke} />;
    case "line":
      return <Line x1={attrs.x1} y1={attrs.y1} x2={attrs.x2} y2={attrs.y2} {...stroke} />;
    case "polyline":
      return <Polyline points={attrs.points} {...stroke} />;
    default:
      return null;
  }
}

function TotalsBlock({ element, data }: { element: TotalsElement; data: DesignData }) {
  return (
    <>
      {designTotalsRows(data).map((row) => (
        <View
          key={row.label}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            paddingVertical: element.rowPadding,
            paddingHorizontal: element.rowPadding * 2,
            ...(row.total && element.totalFill ? { backgroundColor: element.totalFill } : {}),
          }}
        >
          <Text
            style={{
              ...fontStyle(element.fontFamily, row.total && element.totalBold),
              fontSize: element.fontSize,
              lineHeight: BLOCK_LINE_HEIGHT,
              color: row.total ? element.totalColour : element.colour,
            }}
          >
            {row.label}
          </Text>
          <Text
            style={{
              ...fontStyle(element.fontFamily, row.total && element.totalBold),
              fontSize: element.fontSize,
              lineHeight: BLOCK_LINE_HEIGHT,
              color: row.total ? element.totalColour : element.colour,
            }}
          >
            {row.value}
          </Text>
        </View>
      ))}
    </>
  );
}

function ElementNode({
  element,
  top,
  data,
  images,
  fixed,
}: {
  element: Exclude<DesignElement, LineItemsElement>;
  /** Distance from the top of the block the element is drawn in. */
  top: number;
  data: DesignData;
  images: DesignImages;
  fixed?: boolean;
}) {
  const frame: Style = {
    position: "absolute",
    left: element.x,
    top,
    width: element.w,
  };

  switch (element.type) {
    case "text": {
      const content = fillContent(element.content, data);
      if (!content && !element.fill) return null;
      return (
        <View
          fixed={fixed}
          style={{
            ...frame,
            padding: element.padding,
            ...(element.fill ? { backgroundColor: element.fill, minHeight: element.h } : {}),
          }}
        >
          <Text
            style={{
              ...fontStyle(element.fontFamily, element.bold),
              fontSize: element.fontSize,
              color: element.colour,
              textAlign: element.align,
              lineHeight: element.lineHeight,
              letterSpacing: element.letterSpacing,
              ...(element.uppercase ? { textTransform: "uppercase" } : {}),
            }}
          >
            {content}
          </Text>
        </View>
      );
    }
    case "image": {
      const src =
        element.source.kind === "logo" ? images.logo : images[element.source.assetId];
      if (!src) return null;
      return (
        <PdfImage
          fixed={fixed}
          src={src}
          style={{ ...frame, height: element.h, objectFit: element.fit }}
        />
      );
    }
    case "icon":
      return (
        <Svg fixed={fixed} viewBox="0 0 24 24" style={{ ...frame, height: element.h }}>
          {DESIGNER_ICONS[element.name].map((shape, i) => (
            <IconShapeNode key={i} shape={shape} colour={element.colour} />
          ))}
        </Svg>
      );
    case "shape": {
      const strokeWidth = element.stroke ? element.strokeWidth : 0;
      if (element.shape === "ellipse") {
        return (
          <Svg
            fixed={fixed}
            viewBox={`0 0 ${element.w} ${element.h}`}
            style={{ ...frame, height: element.h }}
          >
            <Ellipse
              cx={element.w / 2}
              cy={element.h / 2}
              rx={Math.max(element.w / 2 - strokeWidth / 2, 0)}
              ry={Math.max(element.h / 2 - strokeWidth / 2, 0)}
              fill={element.fill ?? "none"}
              stroke={element.stroke ?? "none"}
              strokeWidth={strokeWidth}
            />
          </Svg>
        );
      }
      return (
        <View
          fixed={fixed}
          style={{
            ...frame,
            height: element.h,
            borderRadius: element.radius,
            ...(element.fill ? { backgroundColor: element.fill } : {}),
            ...(element.stroke && strokeWidth > 0
              ? { borderWidth: strokeWidth, borderColor: element.stroke }
              : {}),
          }}
        />
      );
    }
    case "totals":
      return (
        <View fixed={fixed} style={frame}>
          <TotalsBlock element={element} data={data} />
        </View>
      );
  }
}

function LineItemsTable({ table, lines }: { table: LineItemsElement; lines: PdfLine[] }) {
  const columns = visibleColumns(table, lines);
  const cell = (key: LineItemColumnKey, width: number): Style => ({
    flexGrow: width,
    flexShrink: 1,
    flexBasis: 0,
    paddingHorizontal: table.cellPadding,
    textAlign: key === "description" ? "left" : "right",
  });
  const rule: Style = table.ruleColour
    ? { borderBottomWidth: 0.75, borderBottomColor: table.ruleColour }
    : {};

  return (
    <View style={{ marginLeft: table.x, width: table.w }}>
      <View
        style={{
          flexDirection: "row",
          paddingVertical: table.cellPadding,
          ...(table.headerFill ? { backgroundColor: table.headerFill } : rule),
        }}
      >
        {columns.map((column) => (
          <Text
            key={column.key}
            style={{
              ...cell(column.key, column.width),
              ...fontStyle(table.fontFamily, table.headerBold),
              fontSize: table.fontSize,
              lineHeight: BLOCK_LINE_HEIGHT,
              color: table.headerColour,
            }}
          >
            {column.label}
          </Text>
        ))}
      </View>
      {lines.map((line, i) => (
        <View
          key={i}
          wrap={false}
          style={{
            flexDirection: "row",
            paddingVertical: table.cellPadding,
            ...rule,
            ...(table.stripeFill && i % 2 === 1 ? { backgroundColor: table.stripeFill } : {}),
          }}
        >
          {columns.map((column) => (
            <Text
              key={column.key}
              style={{
                ...cell(column.key, column.width),
                ...fontStyle(table.fontFamily, false),
                fontSize: table.fontSize,
                lineHeight: BLOCK_LINE_HEIGHT,
                color: table.rowColour,
              }}
            >
              {lineItemCell(line, column.key)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * A custom design as a PDF. Elements above the table keep their place on the
 * first page, the table grows with the invoice's lines, and elements below it
 * follow it down (onto another page when they no longer fit).
 */
export function DesignDocument({
  design,
  data,
  images,
}: {
  design: TemplateDesign;
  data: DesignData;
  images: DesignImages;
}) {
  const table = designTable(design);
  const tableBottom = table.y + table.h;
  const { marginTop, marginBottom } = design.page;

  const others = design.elements.filter(
    (element): element is Exclude<DesignElement, LineItemsElement> =>
      element.type !== "lineItems",
  );
  const repeating = others.filter((element) => elementPlacement(element, table) === "repeat");
  const above = others.filter((element) => elementPlacement(element, table) === "above");
  const below = others.filter((element) => elementPlacement(element, table) === "below");
  const belowHeight = below.reduce(
    (height, element) => Math.max(height, element.y + element.h - tableBottom),
    0,
  );
  // A block taller than a page can never be kept together.
  const keepBelowTogether = belowHeight <= PAGE_HEIGHT - marginTop - marginBottom;

  return (
    <Document>
      <Page
        size="A4"
        wrap
        style={{
          paddingTop: marginTop,
          paddingBottom: marginBottom,
          backgroundColor: design.page.background,
        }}
      >
        {repeating.map((element) => (
          <ElementNode
            key={element.id}
            element={element}
            top={element.y}
            data={data}
            images={images}
            fixed
          />
        ))}
        <View style={{ height: table.y - marginTop }}>
          {above.map((element) => (
            <ElementNode
              key={element.id}
              element={element}
              top={element.y - marginTop}
              data={data}
              images={images}
            />
          ))}
        </View>
        <LineItemsTable table={table} lines={data.lines} />
        {below.length > 0 ? (
          <View wrap={!keepBelowTogether} style={{ height: belowHeight }}>
            {below.map((element) => (
              <ElementNode
                key={element.id}
                element={element}
                top={element.y - tableBottom}
                data={data}
                images={images}
              />
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
