"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";

/** "Earlier year" picker beside the Overview period chips. */
export function PastYearSelect({
  current,
  years,
}: {
  current: string;
  years: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const active = years.some((y) => y.value === current);

  return (
    <Select
      aria-label="Earlier financial year"
      className="w-auto min-w-[8.5rem]"
      triggerClassName={cn(
        "rounded-full py-1",
        active && "border-navy bg-navy text-white [&_svg]:text-white",
      )}
      value={active ? current : ""}
      placeholder="Earlier year"
      options={years}
      onChange={(e) => {
        if (e.target.value) router.push(`/dashboard?period=${e.target.value}`);
      }}
    />
  );
}
