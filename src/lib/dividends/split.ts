/**
 * Split a total amount in pence across shareholders by share count.
 * Uses largest-remainder so the parts always sum to `totalPence`.
 */
export type ShareSplitInput = {
  id: string;
  name: string;
  shareCount: number;
};

export type ShareSplitResult = {
  id: string;
  name: string;
  shareCount: number;
  amountPence: number;
};

export function splitDividendPence(
  totalPence: number,
  holders: ShareSplitInput[],
  totalShares: number,
): ShareSplitResult[] {
  if (!Number.isInteger(totalPence) || totalPence < 0) {
    throw new Error("Total must be a non-negative integer (pence)");
  }
  if (!Number.isInteger(totalShares) || totalShares <= 0) {
    throw new Error("Total shares must be a positive integer");
  }
  if (holders.length === 0) {
    throw new Error("At least one shareholder is required");
  }
  const sumCounts = holders.reduce((s, h) => s + h.shareCount, 0);
  if (sumCounts !== totalShares) {
    throw new Error(
      `Shareholder share counts (${sumCounts}) must equal total shares (${totalShares})`,
    );
  }
  for (const h of holders) {
    if (!Number.isInteger(h.shareCount) || h.shareCount <= 0) {
      throw new Error("Each shareholder must have a positive share count");
    }
  }

  const exact = holders.map((h) => ({
    ...h,
    exact: (totalPence * h.shareCount) / totalShares,
  }));
  const floors = exact.map((h) => ({
    id: h.id,
    name: h.name,
    shareCount: h.shareCount,
    amountPence: Math.floor(h.exact),
    remainder: h.exact - Math.floor(h.exact),
  }));
  let allocated = floors.reduce((s, h) => s + h.amountPence, 0);
  let leftover = totalPence - allocated;

  const byRemainder = [...floors].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; leftover > 0 && i < byRemainder.length; i++) {
    byRemainder[i].amountPence += 1;
    leftover -= 1;
  }

  const byId = new Map(byRemainder.map((h) => [h.id, h.amountPence]));
  return holders.map((h) => ({
    id: h.id,
    name: h.name,
    shareCount: h.shareCount,
    amountPence: byId.get(h.id)!,
  }));
}
