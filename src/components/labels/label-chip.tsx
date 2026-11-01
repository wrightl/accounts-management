import { Check } from "lucide-react";
import {
  LABEL_CHIP_CLASSES,
  LABEL_COLORS,
  LABEL_SWATCH_CLASSES,
  type LabelColor,
} from "@/lib/labels/colors";
import { cn } from "@/lib/utils";

export function LabelChip({ name, color }: { name: string; color: LabelColor }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full px-2.5 py-0.5 text-xs font-medium",
        LABEL_CHIP_CLASSES[color],
      )}
    >
      {name}
    </span>
  );
}

export function LabelColorPicker({
  value,
  disabled,
  onChange,
}: {
  value: LabelColor;
  disabled?: boolean;
  onChange: (color: LabelColor) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-1.5">
      {LABEL_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          disabled={disabled}
          onClick={() => onChange(color)}
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-full text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50",
            LABEL_SWATCH_CLASSES[color],
          )}
        >
          {value === color ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
        </button>
      ))}
    </div>
  );
}
