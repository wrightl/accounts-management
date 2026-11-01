"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { overlayPortalTarget } from "@/components/ui/portal-target";

const GAP_PX = 6;
const EDGE_PX = 8;
const CLOSE_DELAY_MS = 120;

/**
 * Text tooltip on hover and keyboard focus. Line breaks in `content` are kept.
 * Portalled so a table's overflow can't clip it, and it stays open while the
 * pointer is over it so a long note can be scrolled.
 */
export function Tooltip({
  id,
  content,
  children,
}: {
  id: string;
  content: ReactNode;
  children: ReactNode;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  const show = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);
  const hide = useCallback(() => {
    cancelClose();
    setOpen(false);
    setPosition(null);
  }, [cancelClose]);
  const scheduleHide = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(hide, CLOSE_DELAY_MS);
  }, [cancelClose, hide]);

  useEffect(() => cancelClose, [cancelClose]);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current?.getBoundingClientRect();
    const tooltip = tooltipRef.current?.getBoundingClientRect();
    if (!trigger || !tooltip) return;
    const above = trigger.top - tooltip.height - GAP_PX;
    const top = above >= EDGE_PX ? above : trigger.bottom + GAP_PX;
    const left = Math.max(
      EDGE_PX,
      Math.min(trigger.left, window.innerWidth - tooltip.width - EDGE_PX),
    );
    setPosition({ top, left });
  }, [open, content]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    const onScroll = (e: Event) => {
      // Scrolling the note itself shouldn't close it.
      if (e.target instanceof Node && tooltipRef.current?.contains(e.target)) return;
      hide();
    };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, hide]);

  const portalTarget = open ? overlayPortalTarget(triggerRef.current) : null;

  return (
    <span
      ref={triggerRef}
      className="inline-flex"
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onFocus={(e) => {
        // Focus returning from a closed dialog shouldn't reopen it, only keyboard focus.
        if (e.target.matches(":focus-visible")) show();
      }}
      onBlur={hide}
      onClick={hide}
    >
      {children}
      {portalTarget
        ? createPortal(
            <div
              ref={tooltipRef}
              id={id}
              role="tooltip"
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleHide}
              onClick={(e) => e.stopPropagation()}
              style={{
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                visibility: position ? "visible" : "hidden",
              }}
              className="fixed z-50 max-h-80 w-max max-w-xs overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm font-normal normal-case tracking-normal text-foreground shadow-lg"
            >
              {content}
            </div>,
            portalTarget,
          )
        : null}
    </span>
  );
}
