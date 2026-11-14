"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { DesignData } from "@/lib/pdf/designer/fields";
import {
  PAGE_HEIGHT,
  PAGE_WIDTH,
  designTable,
  type DesignElement,
  type TemplateDesign,
} from "@/lib/pdf/designer/schema";
import { ElementView } from "@/components/invoice-designer/element-view";
import {
  ELEMENT_TYPE_LABELS,
  createElement,
  type DesignerAction,
  type DesignerState,
  type NewElementSpec,
} from "@/components/invoice-designer/state";

/** dataTransfer type for things dragged from the palette. */
export const PALETTE_DRAG_TYPE = "application/x-invoice-design-element";

/** How close (in points) an edge has to be to another to snap to it. */
const SNAP_DISTANCE = 4;
const MIN_SIZE = 4;

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const ALL_HANDLES: Handle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

/** Elements whose height follows their content can only be made wider or narrower. */
function handlesFor(element: DesignElement): Handle[] {
  return element.type === "lineItems" || element.type === "totals" ? ["e", "w"] : ALL_HANDLES;
}

const HANDLE_CURSOR: Record<Handle, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function bounds(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((box) => box.x + box.w)) - x,
    h: Math.max(...boxes.map((box) => box.y + box.h)) - y,
  };
}

/**
 * Nudge a moving box so an edge or its centre lines up with the page or with
 * another element when it comes close. Returns the adjusted offset and the
 * line it snapped to, if any.
 */
function snap(
  start: number,
  size: number,
  delta: number,
  targets: number[],
): { delta: number; guide: number | null } {
  let best: { delta: number; guide: number; distance: number } | null = null;
  for (const edge of [0, size / 2, size]) {
    const position = start + delta + edge;
    for (const target of targets) {
      const distance = Math.abs(target - position);
      if (distance <= SNAP_DISTANCE && (!best || distance < best.distance)) {
        best = { delta: target - start - edge, guide: target, distance };
      }
    }
  }
  return best ? { delta: best.delta, guide: best.guide } : { delta, guide: null };
}

function resizeBox(start: Box, handle: Handle, dx: number, dy: number): Box {
  let { x, y, w, h } = start;
  if (handle.includes("e")) w = Math.max(start.w + dx, MIN_SIZE);
  if (handle.includes("s")) h = Math.max(start.h + dy, 1);
  if (handle.includes("w")) {
    w = Math.max(start.w - dx, MIN_SIZE);
    x = start.x + start.w - w;
  }
  if (handle.includes("n")) {
    h = Math.max(start.h - dy, 1);
    y = start.y + start.h - h;
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

type Gesture =
  | {
      kind: "move";
      startX: number;
      startY: number;
      before: TemplateDesign;
      starts: Map<string, Box>;
      box: Box;
      targetsX: number[];
      targetsY: number[];
    }
  | {
      kind: "resize";
      startX: number;
      startY: number;
      before: TemplateDesign;
      id: string;
      handle: Handle;
      start: Box;
    };

/**
 * The A4 page. Elements are drawn where the PDF will draw them (for an
 * invoice with the sample lines) and can be dragged, resized and dropped in.
 */
export function Canvas({
  state,
  dispatch,
  data,
  preview,
  hasLogo,
  zoom,
}: {
  state: DesignerState;
  dispatch: Dispatch<DesignerAction>;
  data: DesignData;
  preview: boolean;
  hasLogo: boolean;
  zoom: number;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });
  // Read by window listeners, which outlive the render they were attached in.
  const latest = useRef({ state, zoom });
  useEffect(() => {
    latest.current = { state, zoom };
  });

  const { design, selected } = state;
  const table = designTable(design);

  const onMeasureTable = useCallback(
    (height: number) => dispatch({ type: "measureTable", height }),
    [dispatch],
  );

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const active = gesture.current;
      if (!active) return;
      const scale = latest.current.zoom;
      const dx = (event.clientX - active.startX) / scale;
      const dy = (event.clientY - active.startY) / scale;

      if (active.kind === "move") {
        const snappedX = snap(active.box.x, active.box.w, dx, active.targetsX);
        const snappedY = snap(active.box.y, active.box.h, dy, active.targetsY);
        setGuides({ x: snappedX.guide, y: snappedY.guide });
        dispatch({
          type: "patch",
          ids: [...active.starts.keys()],
          record: false,
          change: (element) => {
            const start = active.starts.get(element.id)!;
            return {
              ...element,
              x: Math.round(start.x + snappedX.delta),
              y: Math.round(start.y + snappedY.delta),
            };
          },
        });
      } else {
        const box = resizeBox(active.start, active.handle, dx, dy);
        dispatch({
          type: "patch",
          ids: [active.id],
          record: false,
          change: (element) => ({ ...element, ...box }),
        });
      }
    };
    const onUp = () => {
      const active = gesture.current;
      if (!active) return;
      gesture.current = null;
      setGuides({ x: null, y: null });
      dispatch({ type: "checkpoint", before: active.before });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dispatch]);

  const startMove = (event: ReactPointerEvent, element: DesignElement) => {
    if (preview || event.button !== 0) return;
    event.stopPropagation();

    let ids: string[];
    if (event.shiftKey) {
      ids = selected.includes(element.id)
        ? selected.filter((id) => id !== element.id)
        : [...selected, element.id];
      dispatch({ type: "select", ids });
      return;
    }
    if (selected.includes(element.id)) {
      ids = selected;
    } else {
      ids = [element.id];
      dispatch({ type: "select", ids });
    }

    const moving = design.elements.filter((candidate) => ids.includes(candidate.id));
    const others = design.elements.filter((candidate) => !ids.includes(candidate.id));
    gesture.current = {
      kind: "move",
      startX: event.clientX,
      startY: event.clientY,
      before: design,
      starts: new Map(moving.map((item) => [item.id, { x: item.x, y: item.y, w: item.w, h: item.h }])),
      box: bounds(moving),
      targetsX: [
        0,
        PAGE_WIDTH / 2,
        PAGE_WIDTH,
        ...others.flatMap((item) => [item.x, item.x + item.w / 2, item.x + item.w]),
      ],
      targetsY: [
        0,
        PAGE_HEIGHT / 2,
        PAGE_HEIGHT,
        design.page.marginTop,
        PAGE_HEIGHT - design.page.marginBottom,
        ...others.flatMap((item) => [item.y, item.y + item.h / 2, item.y + item.h]),
      ],
    };
  };

  const startResize = (event: ReactPointerEvent, element: DesignElement, handle: Handle) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    gesture.current = {
      kind: "resize",
      startX: event.clientX,
      startY: event.clientY,
      before: design,
      id: element.id,
      handle,
      start: { x: element.x, y: element.y, w: element.w, h: element.h },
    };
  };

  const onDrop = (event: ReactDragEvent) => {
    const raw = event.dataTransfer.getData(PALETTE_DRAG_TYPE);
    const page = pageRef.current;
    if (!raw || !page) return;
    event.preventDefault();
    let spec: NewElementSpec;
    try {
      spec = JSON.parse(raw) as NewElementSpec;
    } catch {
      return;
    }
    const rect = page.getBoundingClientRect();
    const element = createElement(
      spec,
      (event.clientX - rect.left) / zoom,
      (event.clientY - rect.top) / zoom,
    );
    // Centre the new element on the pointer.
    dispatch({
      type: "add",
      element: {
        ...element,
        x: Math.max(Math.round(element.x - element.w / 2), 0),
        y: Math.max(Math.round(element.y - element.h / 2), 0),
      },
    });
  };

  // As in the PDF, elements shown on every page sit behind the rest.
  const drawOrder = [
    ...design.elements.filter((element) => element.repeat),
    ...design.elements.filter((element) => !element.repeat),
  ];
  const single =
    selected.length === 1 ? design.elements.find((element) => element.id === selected[0]) : null;
  const handleSize = 8 / zoom;

  return (
    <div style={{ width: PAGE_WIDTH * zoom, height: PAGE_HEIGHT * zoom }} className="relative mx-auto">
      <div
        ref={pageRef}
        role="group"
        aria-label="Template page"
        onPointerDown={() => {
          if (!preview) dispatch({ type: "select", ids: [] });
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(PALETTE_DRAG_TYPE)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={onDrop}
        style={{
          width: PAGE_WIDTH,
          height: PAGE_HEIGHT,
          transform: `scale(${zoom})`,
          transformOrigin: "top left",
          backgroundColor: design.page.background,
          position: "absolute",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.08)",
          userSelect: "none",
          touchAction: "none",
        }}
      >
        {drawOrder.map((element) => (
          <div
            key={element.id}
            onPointerDown={(event) => startMove(event, element)}
            style={{
              position: "absolute",
              left: element.x,
              top: element.y,
              width: element.w,
              cursor: preview ? "default" : "move",
            }}
          >
            <ElementView
              element={element}
              data={data}
              preview={preview}
              hasLogo={hasLogo}
              onMeasureTable={element.type === "lineItems" ? onMeasureTable : undefined}
            />
          </div>
        ))}

        {preview ? null : (
          <>
            {/* Where continuation pages start and end. */}
            {[design.page.marginTop, PAGE_HEIGHT - design.page.marginBottom].map((y, i) => (
              <div
                key={i}
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: y,
                  borderTop: "1px dashed rgba(100, 116, 139, 0.35)",
                  pointerEvents: "none",
                }}
              />
            ))}
            {/* Everything starting below this line follows the table down the page. */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: table.y + table.h,
                borderTop: "1px dashed rgba(37, 99, 235, 0.5)",
                pointerEvents: "none",
              }}
            />

            {design.elements
              .filter((element) => selected.includes(element.id))
              .map((element) => (
                <div
                  key={element.id}
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: element.x,
                    top: element.y,
                    width: element.w,
                    height: element.h,
                    outline: `${1.5 / zoom}px solid #2563eb`,
                    pointerEvents: "none",
                  }}
                />
              ))}

            {single
              ? handlesFor(single).map((handle) => (
                  <div
                    key={handle}
                    role="presentation"
                    title={`Resize ${ELEMENT_TYPE_LABELS[single.type].toLowerCase()}`}
                    onPointerDown={(event) => startResize(event, single, handle)}
                    style={{
                      position: "absolute",
                      width: handleSize,
                      height: handleSize,
                      left:
                        single.x +
                        (handle.includes("w") ? 0 : handle.includes("e") ? single.w : single.w / 2) -
                        handleSize / 2,
                      top:
                        single.y +
                        (handle.includes("n") ? 0 : handle.includes("s") ? single.h : single.h / 2) -
                        handleSize / 2,
                      backgroundColor: "#ffffff",
                      border: `${1.5 / zoom}px solid #2563eb`,
                      cursor: HANDLE_CURSOR[handle],
                    }}
                  />
                ))
              : null}

            {guides.x !== null ? (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: guides.x,
                  borderLeft: `${1 / zoom}px solid #ec4899`,
                  pointerEvents: "none",
                }}
              />
            ) : null}
            {guides.y !== null ? (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: guides.y,
                  borderTop: `${1 / zoom}px solid #ec4899`,
                  pointerEvents: "none",
                }}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
