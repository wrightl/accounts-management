"use client";

import { useRouter } from "next/navigation";
import { Label, Select } from "@/components/ui/form";
import {
  BANK_PAGE_SIZE_OPTIONS,
  bankListHref,
  type BankListParams,
} from "@/lib/bank/list-params";

export function BankPageSizeSelect({ params }: { params: BankListParams }) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="pageSize" className="mb-0 shrink-0 text-muted">
        Rows per page
      </Label>
      <Select
        id="pageSize"
        className="w-auto min-w-[5rem] py-1"
        value={String(params.pageSize)}
        onChange={(e) => {
          const pageSize = Number(e.target.value) as BankListParams["pageSize"];
          router.push(
            bankListHref(params, {
              pageSize,
              page: 1,
            }),
          );
        }}
      >
        {BANK_PAGE_SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </Select>
    </div>
  );
}
