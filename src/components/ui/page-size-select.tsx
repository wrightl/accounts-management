"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { Label, Select } from "@/components/ui/form";

/** "Rows per page" for a paged list; `hrefs` maps each size to its URL. */
export function PageSizeSelect({
  pageSize,
  hrefs,
}: {
  pageSize: number;
  hrefs: Record<number, string>;
}) {
  const router = useRouter();
  const id = useId();

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="mb-0 shrink-0 text-muted">
        Rows per page
      </Label>
      <Select
        id={id}
        className="w-auto min-w-[5rem] py-1"
        value={String(pageSize)}
        onChange={(e) => {
          const href = hrefs[Number(e.target.value)];
          if (href) router.push(href);
        }}
      >
        {Object.keys(hrefs).map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </Select>
    </div>
  );
}
