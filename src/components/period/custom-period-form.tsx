import { buttonClasses } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";

export function CustomPeriodForm({
  action,
  from,
  to,
  hiddenFields,
}: {
  action: string;
  from: string;
  to: string;
  hiddenFields?: Record<string, string>;
}) {
  return (
    <form
      method="get"
      action={action}
      className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <input type="hidden" name="period" value="custom" />
      {Object.entries(hiddenFields ?? {}).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <div>
        <Label htmlFor="custom-from">From</Label>
        <Input id="custom-from" name="from" type="date" defaultValue={from} required />
      </div>
      <div>
        <Label htmlFor="custom-to">To</Label>
        <Input id="custom-to" name="to" type="date" defaultValue={to} required />
      </div>
      <button type="submit" className={buttonClasses("secondary")}>
        Apply
      </button>
    </form>
  );
}
