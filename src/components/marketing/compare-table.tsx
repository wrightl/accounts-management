import { Check, Minus, X } from "lucide-react";
import {
  ALFA_SUPPORT,
  CAPABILITIES,
  SUPPORT_LABEL,
  type Competitor,
  type Support,
} from "@/lib/marketing/competitors";

function SupportCell({ value }: { value: Support }) {
  const label = SUPPORT_LABEL[value];
  return (
    <td className="px-4 py-3 text-center">
      <span className="inline-flex items-center gap-1.5 text-foreground/90">
        {value === "yes" && <Check className="h-4 w-4 text-success" aria-hidden />}
        {value === "no" && <X className="h-4 w-4 text-muted" aria-hidden />}
        {(value === "partial" || value === "n/a") && (
          <Minus className="h-4 w-4 text-muted" aria-hidden />
        )}
        {label}
      </span>
    </td>
  );
}

/** Capability by capability, Alfa against one or more competitors. */
export function CompareTable({ competitors }: { competitors: readonly Competitor[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-white">
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="py-4 pr-4 pl-5 text-left font-semibold text-foreground">
              Capability
            </th>
            <th scope="col" className="bg-wash/60 px-4 py-4 text-center font-semibold text-navy">
              Alfa
            </th>
            {competitors.map((c) => (
              <th key={c.slug} scope="col" className="px-4 py-4 text-center font-semibold text-foreground">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {CAPABILITIES.map((cap) => (
            <tr key={cap.id}>
              <th scope="row" className="py-3 pr-4 pl-5 text-left font-normal text-foreground/90">
                {cap.label}
              </th>
              <SupportCell value={ALFA_SUPPORT[cap.id]} />
              {competitors.map((c) => (
                <SupportCell key={c.slug} value={c.support[cap.id]} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
