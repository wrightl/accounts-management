"use client";

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
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
  top: number;
  left: number;
  width: number;
};

function optionsFromChildren(children: ReactNode): SelectOption[] {
  const opts: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === "option") {
      const props = (child as ReactElement<{ value?: string; disabled?: boolean; children?: ReactNode }>)
        .props;
      opts.push({
        value: props.value ?? "",
        label: props.children ?? props.value ?? "",
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
}) {
  const uid = useId();
  const id = idProp ?? uid;
  const listboxId = `${id}-listbox`;
  const options = optionsProp ?? optionsFromChildren(children);
  const isControlled = valueProp !== undefined;

  const [internalValue, setInternalValue] = useState(defaultValue);
  const value = isControlled ? valueProp : internalValue;

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

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  function closeMenu() {
    setOpen(false);
  }

  function openMenu() {
    const trigger = triggerRef.current;
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
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
          left: menuPosition.left,
          width: menuPosition.width,
          zIndex: 100,
        }}
        className="max-h-60 overflow-auto rounded-xl border border-border bg-surface py-1 shadow-lg"
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
