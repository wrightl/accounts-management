import { redirect } from "next/navigation";

export default async function BankRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value) qs.set(key, value);
  }
  const query = qs.toString();
  redirect(query ? `/dashboard/transactions?${query}` : "/dashboard/transactions");
}
