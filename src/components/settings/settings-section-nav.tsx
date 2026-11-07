"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PAGE_WIDTH } from "@/components/ui/page-width";

export type SettingsSection = { id: string; label: string };

/** Gap left between the pinned header and a section scrolled to. */
const SECTION_GAP = 16;

function prefersReducedMotion(): boolean {
  const motion = document.documentElement.getAttribute("data-ui-motion");
  if (motion === "reduce") return true;
  if (motion === "full") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Layout for a long settings page: on wide screens the header and a list of
 * the page's sections stay pinned while only the settings scroll. On narrow
 * screens the list is a scrolling chip row above the content. Only worth it on
 * pages with more than about three sections; shorter settings pages stay a
 * single column.
 *
 * Each section's element needs the matching `id`.
 */
export function SettingsWithRail({
  header,
  sections,
  children,
  headerBackground = "bg-background",
}: {
  header: ReactNode;
  /** Matches the page behind the pinned header, so content scrolls out of sight under it. */
  headerBackground?: string;
  sections: SettingsSection[];
  children: ReactNode;
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  // Height the pinned header covers at the top of the scroll area (0 when not pinned).
  const [pinnedHeight, setPinnedHeight] = useState(0);
  // Sticky offsets are measured inside the content area's top padding.
  const [scrollerPadding, setScrollerPadding] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);
  // After a click, keep the clicked section highlighted while the page scrolls
  // past the others (sections near the bottom never reach the top band).
  const clickedAt = useRef(0);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () => {
      const pinned = getComputedStyle(header).position === "sticky";
      setPinnedHeight(pinned ? header.offsetHeight : 0);
      const scroller = document.getElementById("main-content");
      setScrollerPadding(scroller ? parseFloat(getComputedStyle(scroller).paddingTop) || 0 : 0);
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(header);
    window.addEventListener("resize", measure);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && performance.now() - clickedAt.current > 1000) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: `-${pinnedHeight + SECTION_GAP * 4}px 0px -60% 0px` },
    );
    for (const { id } of sections) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [sections, pinnedHeight]);

  // Scroll only the app's content area and land below the pinned header; the
  // browser's own jump would leave the section underneath it.
  const jumpTo = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    const scroller = document.getElementById("main-content");
    if (!target || !scroller) return;
    event.preventDefault();
    clickedAt.current = event.timeStamp;
    setActive(id);
    const offset = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTo({
      top: scroller.scrollTop + offset - pinnedHeight - SECTION_GAP,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <div>
      {/* Pulled up over the content area's top padding so nothing shows above it when pinned. */}
      <div
        ref={headerRef}
        className={cn(
          "z-20 flow-root lg:sticky lg:-top-8 lg:-mt-8 lg:pt-8",
          headerBackground,
        )}
      >
        {header}
      </div>
      <div className="grid gap-6 lg:grid-cols-[12rem_minmax(0,42rem)] lg:gap-10">
        <nav aria-label="Sections on this page" className="min-w-0">
          <ul
            className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:flex-col lg:overflow-visible lg:pb-0"
            style={{ top: Math.max(pinnedHeight - scrollerPadding, 0) }}
          >
            {sections.map(({ id, label }) => (
              <li key={id} className="shrink-0">
                <a
                  href={`#${id}`}
                  aria-current={active === id ? "location" : undefined}
                  onClick={(event) => jumpTo(event, id)}
                  className={cn(
                    "block whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors hover:bg-wash lg:rounded-lg",
                    active === id
                      ? "bg-wash font-medium text-foreground"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className={cn("min-w-0", PAGE_WIDTH.reading)}>{children}</div>
      </div>
    </div>
  );
}
