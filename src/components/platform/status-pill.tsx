import { cn } from "@/lib/utils";

type Tone = "danger" | "warning" | "success" | "neutral" | "info";

const toneClasses: Record<Tone, string> = {
  danger: "bg-destructive/15 text-destructive",
  warning: "bg-warning/15 text-warning",
  success: "bg-success/15 text-success",
  info: "bg-accent/30 text-navy",
  neutral: "bg-wash text-muted",
};

const statusTones: Record<string, Tone> = {
  failed: "danger",
  past_due: "danger",
  unpaid: "danger",
  canceled: "danger",
  suspended: "danger",
  pending: "warning",
  trialing: "info",
  rejected: "neutral",
  processed: "success",
  sent: "success",
  active: "success",
  complimentary: "success",
};

/** Colour-coded status label shared by the platform tables. */
export function StatusPill({
  status,
  label,
  tone,
  className,
}: {
  status: string;
  label?: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        toneClasses[tone ?? statusTones[status] ?? "neutral"],
        className,
      )}
    >
      {label ?? status.replaceAll("_", " ")}
    </span>
  );
}
