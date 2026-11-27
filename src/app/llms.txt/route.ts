import { buildLlmsTxt } from "@/lib/marketing/llms";
import { marketingPriceLabels } from "@/lib/marketing/prices";

// Prices come from Stripe, which is cached for an hour.
export const revalidate = 3600;

export async function GET() {
  return new Response(buildLlmsTxt(await marketingPriceLabels()), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
