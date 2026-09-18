import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

export { Select } from "@/components/ui/select";
export type { SelectOption } from "@/components/ui/select";

const field =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-navy disabled:opacity-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(field, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(field, "min-h-[80px] resize-y", className)}
      {...props}
    />
  );
}

export function Label({
  className,
  required,
  children,
  ...props
}: ComponentProps<"label"> & { required?: boolean }) {
  return (
    <label
      className={cn("mb-1.5 block text-sm font-medium text-foreground", className)}
      {...props}
    >
      {children}
      {required ? (
        <>
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
          <span className="sr-only"> (required)</span>
        </>
      ) : null}
    </label>
  );
}

export function FieldError({
  id,
  children,
}: {
  id?: string;
  children?: ReactNode;
}) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1 text-sm text-destructive" role="alert">
      {children}
    </p>
  );
}
