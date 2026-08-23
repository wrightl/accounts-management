/** HMRC-style mileage allowance default: 45p per mile (stored as pence per mile). */
export const DEFAULT_MILEAGE_RATE_PENCE = 45;

export function mileageAmountPence(miles: number, ratePence: number): number {
  if (miles <= 0 || ratePence <= 0) {
    throw new Error("Miles and rate must be positive");
  }
  return Math.round(miles * ratePence);
}

export function formatMileageSuffix(miles: number, ratePence: number): string {
  return `(${miles} miles @ ${ratePence}p/mi)`;
}

export function appendMileageDescription(
  base: string,
  miles: number,
  ratePence: number,
): string {
  const suffix = formatMileageSuffix(miles, ratePence);
  if (base.includes(suffix)) return base.trim();
  return `${base.trim()} ${suffix}`.trim();
}
