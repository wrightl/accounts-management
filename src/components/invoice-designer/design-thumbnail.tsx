"use client";

import { useEffect, useRef, useState } from "react";
import type { DesignData } from "@/lib/pdf/designer/fields";
import { PAGE_HEIGHT, PAGE_WIDTH, type TemplateDesign } from "@/lib/pdf/designer/schema";
import { ElementView } from "@/components/invoice-designer/element-view";
import { designPoppins } from "@/components/invoice-designer/fonts";

/**
 * A small picture of a design's first page, drawn from the design itself with
 * sample details. Fills the width of its parent.
 */
export function DesignThumbnail({
  design,
  data,
  hasLogo,
}: {
  design: TemplateDesign;
  data: DesignData;
  hasLogo: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const measure = () => setScale(node.clientWidth / PAGE_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={frame}
      aria-hidden
      className={designPoppins.variable}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${PAGE_WIDTH} / ${PAGE_HEIGHT}`,
        overflow: "hidden",
        backgroundColor: design.page.background,
      }}
    >
      {scale > 0 ? (
        <div
          style={{
            position: "absolute",
            width: PAGE_WIDTH,
            height: PAGE_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {/* As in the PDF, elements shown on every page sit behind the rest. */}
          {[
            ...design.elements.filter((element) => element.repeat),
            ...design.elements.filter((element) => !element.repeat),
          ].map((element) => (
            <div
              key={element.id}
              style={{ position: "absolute", left: element.x, top: element.y, width: element.w }}
            >
              <ElementView element={element} data={data} preview hasLogo={hasLogo} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
