"use client";

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { overlayPortalTarget } from "@/components/ui/portal-target";

const field =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-navy disabled:opacity-50";

export type SelectOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

type MenuPosition = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
};

/** Matches `max-h-60`; the menu never grows taller than this. */
const MENU_MAX_HEIGHT = 240;
const MENU_GAP = 4;
/** Keep the menu at least this far from the viewport edges. */
const VIEWPORT_MARGIN = 8;
/** Rough option height used before the menu has rendered and can be measured. */
const ESTIMATED_OPTION_HEIGHT = 36;

/**
 * Place the menu below the trigger, flipping above when there is more room
 * there, and clamp it so it never runs off the edge of the viewport.
 */
function computeMenuPosition(trigger: HTMLElement, contentHeight: number): MenuPosition {
  const rect = trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const desired = Math.min(contentHeight, MENU_MAX_HEIGHT);

  const spaceBelow = viewportHeight - rect.bottom - MENU_GAP - VIEWPORT_MARGIN;
  const spaceAbove = rect.top - MENU_GAP - VIEWPORT_MARGIN;
  const placeAbove = spaceBelow < desired && spaceAbove > spaceBelow;
  const maxHeight = Math.max(0, Math.min(MENU_MAX_HEIGHT, placeAbove ? spaceAbove : spaceBelow));

  const width = Math.min(rect.width, viewportWidth - VIEWPORT_MARGIN * 2);
  const left = Math.min(
    Math.max(rect.left, VIEWPORT_MARGIN),
    viewportWidth - VIEWPORT_MARGIN - width,
  );

  return placeAbove
    ? { bottom: viewportHeight - rect.top + MENU_GAP, left, width, maxHeight }
    : { top: rect.bottom + MENU_GAP, left, width, maxHeight };
}

function optionValue(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function optionsFromChildren(children: ReactNode): SelectOption[] {
  const opts: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === "option") {
      const props = (child as ReactElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>)
        .props;
      const value = optionValue(props.value);
      opts.push({
        value,
        label: props.children ?? value,
        disabled: props.disabled,
      });
    }
  });
  return opts;
}

function labelForValue(options: SelectOption[], value: string): ReactNode {
  const match = options.find((o) => o.value === value);
  if (match) return match.label;
  if (value === "") {
    const empty = options.find((o) => o.value === "");
    if (empty) return empty.label;
  }
  return value || "Select…";
}

export function Select({
  id: idProp,
  name,
  value: valueProp,
  defaultValue = "",
  onChange,
  options: optionsProp,
  children,
  placeholder = "Select…",
  disabled,
  required,
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  "aria-label": ariaLabel,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  options?: SelectOption[];
  children?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
  "aria-label"?: string;
}) {
  const uid = useId();
  const id = idProp ?? uid;
  const listboxId = `${id}-listbox`;
  const options = (optionsProp ?? optionsFromChildren(children)).map((opt) => ({
    ...opt,
    value: optionValue(opt.value),
  }));
  const isControlled = valueProp !== undefined;

  const [internalValue, setInternalValue] = useState(optionValue(defaultValue));
  const value = optionValue(isControlled ? valueProp : internalValue);

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const enabledOptions = options.filter((o) => !o.disabled);
  const selectedIndex = enabledOptions.findIndex((o) => o.value === value);
  const display = labelForValue(options, value);
  const showPlaceholder = value === "" && !options.some((o) => o.value === "");

  const commit = useCallback(
    (next: string) => {
      if (!isControlled) setInternalValue(next);
      onChange?.({
        target: { value: next },
      } as ChangeEvent<HTMLSelectElement>);
      setOpen(false);
    },
    [isControlled, onChange],
  );

  const optionCount = options.length;
  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    // scrollHeight is the full content height even while maxHeight clips it.
    const contentHeight =
      listRef.current?.scrollHeight ?? optionCount * ESTIMATED_OPTION_HEIGHT + 8;
    setMenuPosition(computeMenuPosition(trigger, contentHeight));
  }, [optionCount]);

  function closeMenu() {
    setOpen(false);
  }

  function openMenu() {
    const trigger = triggerRef.current;
    if (trigger) {
      setMenuPosition(
        computeMenuPosition(trigger, options.length * ESTIMATED_OPTION_HEIGHT + 8),
      );
      setPortalTarget(overlayPortalTarget(trigger) ?? document.body);
    }
    const idx = selectedIndex >= 0 ? selectedIndex : 0;
    setHighlight(idx);
    setOpen(true);
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector(`[data-index="${idx}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  // Re-place using the rendered height so the estimate never leaves it clipped.
  useLayoutEffect(() => {
    if (open) updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      closeMenu();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open || highlight < 0) return;
    listRef.current
      ?.querySelector(`[data-index="${highlight}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        if (open && highlight >= 0 && enabledOptions[highlight]) {
          commit(enabledOptions[highlight].value);
        } else {
          openMenu();
        }
        break;
      case "Escape":
        e.preventDefault();
        closeMenu();
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!open) {
          openMenu();
        } else {
          setHighlight((h) => Math.min(h + 1, enabledOptions.length - 1));
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (open) setHighlight((h) => Math.max(h - 1, 0));
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setHighlight(0);
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          setHighlight(enabledOptions.length - 1);
        }
        break;
    }
  };

  const listbox =
    open && menuPosition ? (
      <ul
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-labelledby={id}
        style={{
          position: "fixed",
          top: menuPosition.top,
          bottom: menuPosition.bottom,
          left: menuPosition.left,
          width: menuPosition.width,
          maxHeight: menuPosition.maxHeight,
          zIndex: 100,
        }}
        className="overflow-auto rounded-xl border border-border bg-surface py-1 shadow-lg"
      >
        {options.map((opt, i) => {
          const enabledIdx = enabledOptions.indexOf(opt);
          const isHighlighted = enabledIdx === highlight;
          const isSelected = opt.value === value;
          return (
            <li
              key={`${opt.value}-${i}`}
              role="option"
              aria-selected={isSelected}
              aria-disabled={opt.disabled || undefined}
              data-index={enabledIdx}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm",
                opt.disabled && "cursor-not-allowed opacity-50",
                !opt.disabled && isHighlighted && "bg-wash",
                !opt.disabled && isSelected && "bg-accent/20 font-medium",
                !opt.disabled && !isHighlighted && !isSelected && "hover:bg-wash",
              )}
              onMouseEnter={() => {
                if (!opt.disabled && enabledIdx >= 0) setHighlight(enabledIdx);
              }}
              onClick={() => {
                if (!opt.disabled) commit(opt.value);
              }}
            >
              <span className="truncate">{opt.label}</span>
              {isSelected ? (
                <Check className="h-4 w-4 shrink-0 text-navy" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ul>
    ) : null;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {name ? (
        <input type="hidden" name={name} value={value} required={required} />
      ) : null}

      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) closeMenu();
          else openMenu();
        }}
        onKeyDown={onKeyDown}
        className={cn(
          field,
          "flex items-center justify-between gap-2 text-left",
          disabled && "cursor-not-allowed",
        )}
      >
        <span className={cn("truncate", showPlaceholder && "text-muted")}>
          {showPlaceholder ? placeholder : display}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {listbox && portalTarget ? createPortal(listbox, portalTarget) : null}
    </div>
  );
}
