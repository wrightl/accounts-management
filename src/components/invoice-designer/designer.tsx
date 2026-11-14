"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState, useTransition } from "react";
import { ArrowLeft, Redo2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { updateDocumentTemplate } from "@/actions/document-templates";
import { Button } from "@/components/ui/button";
import { SplitButton } from "@/components/ui/split-button";
import { toast } from "@/components/ui/toast";
import { useUnsavedChangesGuard } from "@/components/ui/use-unsaved-changes-guard";
import type { DesignData } from "@/lib/pdf/designer/fields";
import { parseTemplateDesign, type TemplateDesign } from "@/lib/pdf/designer/schema";
import { DOCUMENT_KIND_LABELS, type DocumentKind } from "@/lib/pdf/templates/registry";
import { cn } from "@/lib/utils";
import { Canvas } from "@/components/invoice-designer/canvas";
import { Inspector } from "@/components/invoice-designer/inspector";
import { designPoppins } from "@/components/invoice-designer/fonts";
import { DesignKindContext } from "@/components/invoice-designer/kind-context";
import { Layers, Palette, type DesignerAsset } from "@/components/invoice-designer/panels";
import { designerReducer, initialDesignerState } from "@/components/invoice-designer/state";

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/**
 * The template designer: things to add on the left, the page in the
 * middle, settings for whatever is selected on the right.
 */
export function Designer({
  templateId,
  kind,
  initialName,
  initialDesign,
  initialAssets,
  data,
  hasLogo,
}: {
  templateId: string;
  /** The document this template is for; sets which details can be placed. */
  kind: DocumentKind;
  initialName: string;
  initialDesign: TemplateDesign;
  initialAssets: DesignerAsset[];
  /** A sample document of this kind with the company's own details, shown on the page. */
  data: DesignData;
  hasLogo: boolean;
}) {
  const [state, dispatch] = useReducer(
    designerReducer,
    initialDesignerState(initialName, initialDesign),
  );
  const [assets, setAssets] = useState(initialAssets);
  const [leftTab, setLeftTab] = useState<"add" | "layers">("add");
  const [preview, setPreview] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [previewing, setPreviewing] = useState(false);

  useUnsavedChangesGuard(state.dirty);

  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });

  const save = () => {
    const parsed = parseTemplateDesign(state.design);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    startSaving(async () => {
      const result = await updateDocumentTemplate(templateId, {
        name: state.name,
        design: parsed.design,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      dispatch({ type: "saved" });
      toast("Template saved");
    });
  };

  const previewPdf = async () => {
    const parsed = parseTemplateDesign(state.design);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    // Opened before the request so the browser treats it as the click's own window.
    const tab = window.open("", "_blank");
    setPreviewing(true);
    try {
      const response = await fetch("/api/document-templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, design: parsed.design }),
      });
      if (!response.ok) throw new Error("preview failed");
      const url = URL.createObjectURL(await response.blob());
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch {
      tab?.close();
      setError("The preview couldn't be made. Try again.");
    } finally {
      setPreviewing(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const { selected } = latest.current;
      const command = event.metaKey || event.ctrlKey;

      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
        return;
      }
      if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
        return;
      }
      if (selected.length === 0) return;

      if (command && event.key.toLowerCase() === "d") {
        event.preventDefault();
        dispatch({ type: "duplicate", ids: selected });
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        dispatch({ type: "remove", ids: selected });
      } else if (event.key === "Escape") {
        dispatch({ type: "select", ids: [] });
      } else if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        dispatch({
          type: "patch",
          ids: selected,
          change: (element) => ({ ...element, x: element.x + dx, y: element.y + dy }),
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const zoomBy = (direction: 1 | -1) => {
    const index = ZOOM_STEPS.indexOf(zoom);
    const next = ZOOM_STEPS[Math.min(Math.max(index + direction, 0), ZOOM_STEPS.length - 1)];
    setZoom(next);
  };

  const iconButton =
    "rounded-lg border border-border bg-surface p-2 text-foreground hover:bg-wash disabled:opacity-40";

  return (
    <DesignKindContext.Provider value={kind}>
    <div className={cn(designPoppins.variable, "flex min-h-0 flex-col")}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/settings/document-templates?type=${kind}`}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Templates
        </Link>
        <span className="rounded-full bg-wash px-2.5 py-0.5 text-xs text-muted">
          {DOCUMENT_KIND_LABELS[kind]} template
        </span>
        <input
          aria-label="Template name"
          value={state.name}
          maxLength={80}
          onChange={(event) => dispatch({ type: "rename", name: event.target.value })}
          className="min-w-[10rem] flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 font-display text-xl font-semibold hover:border-border focus:border-navy focus:outline-none"
        />
        <button
          type="button"
          className={iconButton}
          title="Undo"
          aria-label="Undo"
          disabled={state.past.length === 0}
          onClick={() => dispatch({ type: "undo" })}
        >
          <Undo2 className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={iconButton}
          title="Redo"
          aria-label="Redo"
          disabled={state.future.length === 0}
          onClick={() => dispatch({ type: "redo" })}
        >
          <Redo2 className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={iconButton}
          title="Zoom out"
          aria-label="Zoom out"
          disabled={zoom === ZOOM_STEPS[0]}
          onClick={() => zoomBy(-1)}
        >
          <ZoomOut className="h-4 w-4" aria-hidden />
        </button>
        <span className="w-12 text-center text-sm tabular-nums text-muted">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          className={iconButton}
          title="Zoom in"
          aria-label="Zoom in"
          disabled={zoom === ZOOM_STEPS.at(-1)}
          onClick={() => zoomBy(1)}
        >
          <ZoomIn className="h-4 w-4" aria-hidden />
        </button>
        <SplitButton
          variant="ghost"
          primaryLabel={preview ? "Back to editing" : "Preview"}
          onPrimary={() => {
            setPreview((on) => !on);
            dispatch({ type: "select", ids: [] });
          }}
          menuAriaLabel="More preview options"
          options={[
            {
              key: "pdf",
              label: previewing ? "Making PDF…" : "Preview as PDF",
              onSelect: () => {
                if (!previewing) void previewPdf();
              },
            },
          ]}
        />
        <Button type="button" onClick={save} disabled={saving || !state.dirty}>
          {saving ? "Saving…" : state.dirty ? "Save" : "Saved"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)_17rem]">
        <aside
          aria-label="Things to add"
          className={cn(
            "rounded-2xl border border-border bg-surface p-3 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto",
            preview && "pointer-events-none opacity-50",
          )}
        >
          <div role="tablist" aria-label="Left panel" className="mb-3 flex gap-1 rounded-full bg-wash p-0.5">
            {(["add", "layers"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={leftTab === tab}
                onClick={() => setLeftTab(tab)}
                className={cn(
                  "flex-1 rounded-full px-3 py-1 text-sm",
                  leftTab === tab ? "bg-surface font-medium shadow-sm" : "text-muted",
                )}
              >
                {tab === "add" ? "Add" : "Layers"}
              </button>
            ))}
          </div>
          {leftTab === "add" ? (
            <Palette
              design={state.design}
              dispatch={dispatch}
              assets={assets}
              onAssetsChange={setAssets}
            />
          ) : (
            <Layers design={state.design} selected={state.selected} dispatch={dispatch} />
          )}
        </aside>

        <div className="min-w-0 overflow-auto rounded-2xl bg-wash p-6 lg:max-h-[calc(100vh-11rem)]">
          <Canvas
            state={state}
            dispatch={dispatch}
            data={data}
            preview={preview}
            hasLogo={hasLogo}
            zoom={zoom}
          />
        </div>

        <aside
          aria-label="Settings for the selection"
          className={cn(
            "rounded-2xl border border-border bg-surface p-3 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto",
            preview && "pointer-events-none opacity-50",
          )}
        >
          <Inspector
            key={state.selected.join(",")}
            design={state.design}
            selected={state.selected}
            dispatch={dispatch}
            assets={assets}
          />
        </aside>
      </div>
    </div>
    </DesignKindContext.Provider>
  );
}
